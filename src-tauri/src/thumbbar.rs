//! Windows taskbar thumbnail toolbar: the Like / Previous / Play-Pause / Next
//! row shown under the taskbar preview of the main window.
//!
//! Tauri does not wrap `ITaskbarList3`, so this module talks to the shell
//! directly. The frontend mirrors the player state here through
//! `thumbbar_set_state` (the same shape as the Android media-session
//! bridge), and button clicks travel back as the `thumbbar-action` event.
//!
//! Everything COM-related lives in a thread-local on the main thread: the
//! taskbar interface is apartment-bound, and the window subclass that
//! receives the clicks runs there anyway.

use serde::Deserialize;
use tauri::AppHandle;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct ThumbbarTooltips {
    pub like: String,
    pub unlike: String,
    pub previous: String,
    pub play: String,
    pub pause: String,
    pub next: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct ThumbbarState {
    pub has_track: bool,
    pub playing: bool,
    pub liked: bool,
    pub can_like: bool,
    pub has_previous: bool,
    pub has_next: bool,
    pub tooltips: ThumbbarTooltips,
}

/// Installs the toolbar on the main window. No-op outside Windows.
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    imp::setup(app)
}

#[tauri::command]
pub fn thumbbar_set_state(app: AppHandle, state: ThumbbarState) -> Result<(), String> {
    imp::set_state(&app, state)
}

/// Other desktop platforms have no equivalent; the frontend never calls the
/// command there, and this stub keeps the public API identical.
#[cfg(not(windows))]
mod imp {
    use super::ThumbbarState;
    use tauri::AppHandle;

    #[allow(clippy::unnecessary_wraps)]
    pub fn setup(_app: &tauri::App) -> tauri::Result<()> {
        Ok(())
    }

    #[allow(clippy::unnecessary_wraps)]
    pub fn set_state(_app: &AppHandle, _state: ThumbbarState) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(windows)]
mod imp {
    use super::ThumbbarState;
    use std::cell::{Cell, RefCell};
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_DISABLED,
        THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
        THUMBBUTTONFLAGS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconFromResourceEx, RegisterWindowMessageW, HICON, LR_DEFAULTCOLOR, WM_COMMAND,
    };

    const EVENT_NAME: &str = "thumbbar-action";
    const SUBCLASS_ID: usize = 0x4147_5442; // "AGTB"

    const ID_LIKE: u32 = 1;
    const ID_PREVIOUS: u32 = 2;
    const ID_PLAY_PAUSE: u32 = 3;
    const ID_NEXT: u32 = 4;

    /// PNG version tag for `CreateIconFromResourceEx`.
    const ICON_RESOURCE_VERSION: u32 = 0x0003_0000;

    /// Raster sizes shipped for each glyph; the taskbar draws small icons at
    /// 16px × DPI scale, so these cover 100 / 125 / 150 / 200 %.
    const ICON_SIZES: [u32; 4] = [16, 20, 24, 32];

    macro_rules! icon_pngs {
        ($name:literal) => {
            [
                include_bytes!(concat!("../icons/thumbbar/", $name, "-16.png")),
                include_bytes!(concat!("../icons/thumbbar/", $name, "-20.png")),
                include_bytes!(concat!("../icons/thumbbar/", $name, "-24.png")),
                include_bytes!(concat!("../icons/thumbbar/", $name, "-32.png")),
            ]
        };
    }

    struct IconSet {
        like: HICON,
        like_filled: HICON,
        previous: HICON,
        play: HICON,
        pause: HICON,
        next: HICON,
    }

    impl IconSet {
        fn load(dpi: u32) -> Self {
            let wanted = 16 * dpi / 96;
            let index = ICON_SIZES
                .iter()
                .position(|size| *size >= wanted)
                .unwrap_or(ICON_SIZES.len() - 1);
            let load = |pngs: [&[u8]; 4]| unsafe {
                CreateIconFromResourceEx(
                    pngs[index],
                    true,
                    ICON_RESOURCE_VERSION,
                    0,
                    0,
                    LR_DEFAULTCOLOR,
                )
                .unwrap_or_else(|e| {
                    log::warn!("thumbbar: failed to create icon: {e}");
                    HICON::default()
                })
            };
            Self {
                like: load(icon_pngs!("like")),
                like_filled: load(icon_pngs!("like-filled")),
                previous: load(icon_pngs!("prev")),
                play: load(icon_pngs!("play")),
                pause: load(icon_pngs!("pause")),
                next: load(icon_pngs!("next")),
            }
        }
    }

    struct Thumbbar {
        app: AppHandle,
        hwnd: HWND,
        taskbar: ITaskbarList3,
        icons: IconSet,
        /// `ThumbBarAddButtons` is a one-shot per taskbar button: afterwards
        /// only `ThumbBarUpdateButtons` is allowed, until the shell recreates
        /// the button (explorer restart) and asks for the toolbar again.
        buttons_added: bool,
        state: ThumbbarState,
    }

    thread_local! {
        static THUMBBAR: RefCell<Option<Thumbbar>> = const { RefCell::new(None) };
        static TASKBAR_BUTTON_CREATED: Cell<u32> = const { Cell::new(0) };
    }

    fn button(id: u32, icon: HICON, tip: &str, enabled: bool) -> THUMBBUTTON {
        let mut sz_tip = [0u16; 260];
        for (dst, ch) in sz_tip.iter_mut().zip(tip.encode_utf16().take(259)) {
            *dst = ch;
        }
        let flags: THUMBBUTTONFLAGS = if enabled { THBF_ENABLED } else { THBF_DISABLED };
        THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: id,
            iBitmap: 0,
            hIcon: icon,
            szTip: sz_tip,
            dwFlags: flags,
        }
    }

    impl Thumbbar {
        fn buttons(&self) -> [THUMBBUTTON; 4] {
            let s = &self.state;
            let tips = &s.tooltips;
            let icons = &self.icons;
            [
                button(
                    ID_LIKE,
                    if s.liked {
                        icons.like_filled
                    } else {
                        icons.like
                    },
                    if s.liked { &tips.unlike } else { &tips.like },
                    s.has_track && s.can_like,
                ),
                button(ID_PREVIOUS, icons.previous, &tips.previous, s.has_previous),
                button(
                    ID_PLAY_PAUSE,
                    if s.playing { icons.pause } else { icons.play },
                    if s.playing { &tips.pause } else { &tips.play },
                    s.has_track,
                ),
                button(ID_NEXT, icons.next, &tips.next, s.has_next),
            ]
        }

        fn sync(&mut self) {
            let buttons = self.buttons();
            unsafe {
                if self.buttons_added {
                    if let Err(e) = self.taskbar.ThumbBarUpdateButtons(self.hwnd, &buttons) {
                        log::warn!("thumbbar: update failed: {e}");
                    }
                } else {
                    match self.taskbar.ThumbBarAddButtons(self.hwnd, &buttons) {
                        Ok(()) => self.buttons_added = true,
                        // Expected before the shell has created the taskbar
                        // button; `TaskbarButtonCreated` triggers a retry.
                        Err(e) => log::debug!("thumbbar: add deferred: {e}"),
                    }
                }
            }
        }
    }

    const fn action_for(id: u32) -> Option<&'static str> {
        match id {
            ID_LIKE => Some("like"),
            ID_PREVIOUS => Some("previous"),
            ID_PLAY_PAUSE => Some("play-pause"),
            ID_NEXT => Some("next"),
            _ => None,
        }
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _uid: usize,
        _ref_data: usize,
    ) -> LRESULT {
        if msg == WM_COMMAND && (wparam.0 >> 16) as u32 == THBN_CLICKED {
            let id = (wparam.0 & 0xFFFF) as u32;
            // Take the handle out of the borrow first: emitting may re-enter
            // the message loop, and a live RefCell borrow there would panic.
            let app = THUMBBAR.with_borrow(|t| t.as_ref().map(|t| t.app.clone()));
            if let (Some(app), Some(action)) = (app, action_for(id)) {
                let _ = app.emit(EVENT_NAME, action);
            }
            return LRESULT(0);
        }

        if msg != 0 && msg == TASKBAR_BUTTON_CREATED.get() {
            THUMBBAR.with_borrow_mut(|t| {
                if let Some(t) = t {
                    t.buttons_added = false;
                    t.sync();
                }
            });
        }

        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    pub fn setup(app: &tauri::App) -> tauri::Result<()> {
        let Some(window) = app.get_webview_window("main") else {
            return Ok(());
        };
        let hwnd = window.hwnd()?;

        // The event loop already initialised COM on this thread; a second
        // call only reports that (S_FALSE / RPC_E_CHANGED_MODE) and is safe.
        let _ = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };

        let taskbar: ITaskbarList3 =
            match unsafe { CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER) } {
                Ok(taskbar) => taskbar,
                Err(e) => {
                    log::warn!("thumbbar: TaskbarList unavailable: {e}");
                    return Ok(());
                }
            };
        if let Err(e) = unsafe { taskbar.HrInit() } {
            log::warn!("thumbbar: HrInit failed: {e}");
            return Ok(());
        }

        let created_msg = unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) };
        TASKBAR_BUTTON_CREATED.set(created_msg);

        if !unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0) }.as_bool() {
            log::warn!("thumbbar: SetWindowSubclass failed");
            return Ok(());
        }

        let icons = IconSet::load(unsafe { GetDpiForWindow(hwnd) });

        THUMBBAR.set(Some(Thumbbar {
            app: app.handle().clone(),
            hwnd,
            taskbar,
            icons,
            buttons_added: false,
            state: ThumbbarState::default(),
        }));
        Ok(())
    }

    pub fn set_state(app: &AppHandle, state: ThumbbarState) -> Result<(), String> {
        app.run_on_main_thread(move || {
            THUMBBAR.with_borrow_mut(|t| {
                if let Some(t) = t {
                    t.state = state;
                    t.sync();
                }
            });
        })
        .map_err(|e| e.to_string())
    }
}
