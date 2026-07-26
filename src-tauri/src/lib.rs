use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Fixa, diferente de 3000 (onde `npm run dev` pode estar rodando em paralelo
// nesta mesma máquina) — app de usuário único, não precisa de porta dinâmica.
const PORT: u16 = 47821;

struct Sidecar(Mutex<Option<CommandChild>>);

// Comando próprio pro seletor de pasta nativo, no lugar de chamar
// @tauri-apps/plugin-dialog direto do JS.
//
// Investigação (2 rodadas): a primeira tentativa foi chamar `.set_parent(&window)`
// no builder aqui, já que o comando `open` do próprio plugin só faz essa chamada
// quando compilado pra Windows/macOS (ver commands.rs do crate tauri-plugin-dialog).
// Isso NÃO resolveu — confirmado lendo o crate `rfd` (que o plugin usa por baixo):
// o backend GTK3 do Linux (rfd 0.16, src/backend/gtk3/file_dialog/dialog_ffi.rs)
// nunca lê o campo `parent` do builder — `set_parent` é armazenado mas
// simplesmente ignorado nesse backend específico. Confirmado também na prática:
// o diálogo abre (mapeado, WM_STATE Normal), mas sem WM_TRANSIENT_FOR nenhum.
//
// Fix real: como o diálogo GTK é uma janela de verdade do nosso próprio processo,
// assim que ele aparece nós mesmos marcamos WM_TRANSIENT_FOR e pedimos pro
// gerenciador de janelas ativá-lo via _NET_ACTIVE_WINDOW (protocolo EWMH padrão,
// suportado pelo Cinnamon/Muffin) — ver `raise_new_dialog_window` abaixo.
#[tauri::command]
async fn pick_folder(window: tauri::Window, app: tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(handle) = window.window_handle() {
            let main_window_id: u32 = match handle.as_raw() {
                RawWindowHandle::Xlib(h) => h.window as u32,
                RawWindowHandle::Xcb(h) => h.window.get(),
                _ => 0,
            };
            if main_window_id != 0 {
                std::thread::spawn(move || linux_x11::raise_new_dialog_window(main_window_id));
            }
        }
    }

    let path = app
        .dialog()
        .file()
        .set_title("Escolher pasta do vault")
        .set_parent(&window)
        .blocking_pick_folder()?;
    path.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

// Fica isolado num módulo próprio porque só faz sentido no Linux (X11) — o
// AppImage é o único alvo de empacotamento deste app (ver tauri.conf.json).
#[cfg(target_os = "linux")]
mod linux_x11 {
    use std::time::{Duration, Instant};
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ClientMessageEvent, ConnectionExt, EventMask, PropMode};
    use x11rb::wrapper::ConnectionExt as _;

    // Espera até 3s por uma nova janela top-level do NOSSO processo (via
    // _NET_WM_PID, que o GTK preenche sozinho em toda janela que cria) que
    // não seja a janela principal — ou seja, o diálogo recém-aberto — e daí
    // define WM_TRANSIENT_FOR + pede ativação via _NET_ACTIVE_WINDOW.
    pub fn raise_new_dialog_window(main_window_id: u32) {
        let own_pid = std::process::id();
        let Ok((conn, screen_num)) = x11rb::connect(None) else { return };
        let root = conn.setup().roots[screen_num].root;

        let Ok(net_client_list) = intern(&conn, b"_NET_CLIENT_LIST") else { return };
        let Ok(net_wm_pid) = intern(&conn, b"_NET_WM_PID") else { return };
        let Ok(net_active_window) = intern(&conn, b"_NET_ACTIVE_WINDOW") else { return };
        let Ok(wm_transient_for) = intern(&conn, b"WM_TRANSIENT_FOR") else { return };

        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Some(dialog_id) = find_own_window(&conn, root, net_client_list, net_wm_pid, own_pid, main_window_id)
            {
                let _ = conn.change_property32(
                    PropMode::REPLACE,
                    dialog_id,
                    wm_transient_for,
                    AtomEnum::WINDOW,
                    &[main_window_id],
                );
                let event = ClientMessageEvent::new(32, dialog_id, net_active_window, [1, 0, main_window_id, 0, 0]);
                let _ = conn.send_event(
                    false,
                    root,
                    EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
                    event,
                );
                let _ = conn.flush();
                return;
            }
            std::thread::sleep(Duration::from_millis(80));
        }
    }

    fn intern<C: Connection>(conn: &C, name: &[u8]) -> Result<u32, ()> {
        conn.intern_atom(false, name)
            .map_err(|_| ())?
            .reply()
            .map_err(|_| ())
            .map(|r| r.atom)
    }

    fn find_own_window<C: Connection>(
        conn: &C,
        root: u32,
        net_client_list: u32,
        net_wm_pid: u32,
        own_pid: u32,
        exclude: u32,
    ) -> Option<u32> {
        let reply = conn
            .get_property(false, root, net_client_list, AtomEnum::WINDOW, 0, u32::MAX)
            .ok()?
            .reply()
            .ok()?;
        let ids: Vec<u32> = reply.value32()?.collect();
        for wid in ids {
            if wid == exclude {
                continue;
            }
            let Ok(cookie) = conn.get_property(false, wid, net_wm_pid, AtomEnum::CARDINAL, 0, 1) else {
                continue;
            };
            let Ok(pid_reply) = cookie.reply() else {
                continue;
            };
            if pid_reply.value32().and_then(|mut vals| vals.next()) == Some(own_pid) {
                return Some(wid);
            }
        }
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Sidecar(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![pick_folder])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Em `cargo tauri dev` a janela já aponta sozinha pro devUrl
            // (npm run dev, porta 3000) — não subir o sidecar aqui, senão
            // teríamos dois servidores Next rodando ao mesmo tempo.
            #[cfg(not(debug_assertions))]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    if let Err(e) = start_sidecar(&handle) {
                        eprintln!("[sidecar] falha ao iniciar: {e}");
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao construir a aplicação Tauri");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<Sidecar>() {
                if let Some(child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        }
    });
}

#[cfg(not(debug_assertions))]
fn start_sidecar(handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = handle.path().resource_dir()?;
    let app_data_dir = handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;

    let bundled = resource_dir.join("standalone");
    let runtime_dir = app_data_dir.join("standalone");

    // Copia pra uma pasta GRAVÁVEL — o conteúdo do AppImage é somente-leitura
    // em runtime (squashfs montado), e o Next escreve em .next/cache +
    // .data/<vaultId> (índice SQLite de cada vault) durante o uso normal.
    let marker = runtime_dir.join(".bundled-version");
    let current_version = env!("CARGO_PKG_VERSION");
    let needs_copy = !runtime_dir.exists()
        || std::fs::read_to_string(&marker).unwrap_or_default() != current_version;

    if needs_copy {
        if runtime_dir.exists() {
            std::fs::remove_dir_all(&runtime_dir)?;
        }
        let mut opts = fs_extra::dir::CopyOptions::new();
        opts.copy_inside = true;
        fs_extra::dir::copy(&bundled, &runtime_dir, &opts)?;
        std::fs::write(&marker, current_version)?;
    }

    let env_file = runtime_dir.join(".env.local");
    let mut args = vec!["server.js".to_string()];
    if env_file.exists() {
        args.insert(0, format!("--env-file={}", env_file.display()));
    }

    let (mut rx, child) = handle
        .shell()
        .sidecar("next-server")?
        .current_dir(&runtime_dir)
        .env("PORT", PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .args(args)
        .spawn()?;

    handle.state::<Sidecar>().0.lock().unwrap().replace(child);

    // Log de stdout/stderr só pra depuração — não usar como sinal de
    // "pronto" (mensagens de log do Next podem mudar entre versões); o poll
    // de TCP abaixo é o sinal confiável.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            use tauri_plugin_shell::process::CommandEvent;
            match event {
                CommandEvent::Stdout(l) => eprintln!("[next] {}", String::from_utf8_lossy(&l)),
                CommandEvent::Stderr(l) => eprintln!("[next:err] {}", String::from_utf8_lossy(&l)),
                _ => {}
            }
        }
    });

    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    loop {
        if TcpStream::connect(("127.0.0.1", PORT)).is_ok() {
            break;
        }
        if std::time::Instant::now() > deadline {
            return Err("sidecar não respondeu a tempo".into());
        }
        std::thread::sleep(Duration::from_millis(150));
    }

    if let Some(window) = handle.get_webview_window("main") {
        window.eval(&format!("window.location.replace('http://127.0.0.1:{PORT}')"))?;
    }

    Ok(())
}
