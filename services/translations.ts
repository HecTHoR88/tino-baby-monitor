
import { Language } from '../types';

export const translations = {
  es: {
    // General
    app_name: "TiNO Baby Monitor",
    subtitle: "BABY MONITOR",
    install_app: "Instalar App",
    install_desc: "Recomendado para mejor uso",
    
    // Home
    mode_camera: "Modo Cámara",
    mode_monitor: "Modo Monitor",
    baby_title: "BaBy",
    parent_title: "Padres",
    
    // Tabs
    tab_home: "Home",
    tab_devices: "Dispositivos",
    tab_config: "Config",
    
    // Devices Tab
    dev_title: "Dispositivos",
    dev_subtitle: "Historial de conexiones.",
    my_cameras: "Mis Cámaras",
    auth_receivers: "Receptores Autorizados",
    no_cameras: "No has conectado a ninguna cámara.",
    no_receivers: "Nadie se ha conectado a ti.",
    connect_btn: "Conectar",
    last_conn: "Última:",
    conn_history: "Historial de Conexiones",
    back_btn: "Volver",
    
    // Settings Tab
    set_title: "Configuración",
    set_subtitle: "Personaliza tu experiencia TiNO.",
    dev_name_title: "Nombre de Dispositivo",
    dev_name_desc: "Cómo te verán los demás",
    language: "Idioma",
    edit_btn: "EDITAR",
    ok_btn: "OK",
    
    // Customization
    brand_title: "Identidad",
    brand_desc: "Toca para cambiar el logo",
    reset_logo: "Restaurar original",
    
    // Tutorial
    tut_title: "Guía Rápida",
    tut_skip: "Omitir",
    tut_next: "Siguiente",
    tut_start: "Comenzar",
    tut_1_title: "Elige un Rol",
    tut_1_desc: "Usa un teléfono como CÁMARA (junto al bebé) y otro como MONITOR (contigo).",
    tut_2_title: "Conexión Segura",
    tut_2_desc: "En el modo CÁMARA verás un código QR. Escanéalo con el dispositivo MONITOR para vincularlos.",
    tut_3_title: "Monitoreo Inteligente",
    tut_3_desc: "Recibe alertas de llanto, habla a tu bebé y controla la luz nocturna a distancia.",

    // Baby Monitor (Sender)
    connecting: "CONECTANDO...",
    online: "EN LÍNEA",
    link_device: "Vincular Dispositivo",
    secure_conn: "Conexión Segura & Cifrada",
    scan_instruction: "Escanea para conectar automáticamente.",
    connected_users: "Conectados",
    max_users: "Sistema Seguro",
    max_users_desc: "Máximo de 3 padres conectados.",
    ai_active: "IA ACTIVA",
    lullaby_active: "NANA ACTIVA",
    flash_on: "FLASH ON",
    saver_on: "AHORRO ON",
    settings_modal: "Configuración",
    cam_select: "Cámara",
    back_cam: "Trasera",
    front_cam: "Frontal",
    mic_title: "Micrófono",
    mic_on: "Activado",
    mic_off: "Silenciado",
    res_title: "Resolución",
    ai_alerts: "Alertas IA",
    ai_desc: "Notificar llanto/movimiento",
    power_save: "Ahorro Energía",
    power_desc: "Atenuar pantalla tras 20s",
    dim_default: "Brillo por defecto (10%)",
    very_dark: "Muy oscuro",
    medium_dark: "Medio",
    dim_wake: "Toca para despertar",
    
    // Parent Station (Receiver)
    connect_title: "Conectar",
    scan_qr_btn: "Escanear QR",
    scan_qr_desc: "Vincular monitor automáticamente",
    manual_id: "Ingresar ID manual",
    scanning: "Escaneando...",
    cancel_btn: "Cancelar",
    secure_badge: "SECURE",
    live_badge: "EN VIVO",
    talk_btn: "HABLAR",
    lullaby_btn: "NANA",
    light_btn: "LUZ",
    activate_sound: "ACTIVAR SONIDO",
    low_battery: "⚠️ Batería Baja en Cámara!",
    conn_error: "Error de conexión.",
    conn_timeout: "Tiempo de espera agotado.",
    conn_ended: "Conexión finalizada.",
    
    // Notifications
    alert_cry_title: "¡Alerta! Bebé Llorando",
    alert_move_title: "Movimiento Detectado",
    alert_body: "TiNO ha detectado actividad en la cuna.",
    auth_error: "Token de seguridad inválido."
  },
  en: {
    // General
    app_name: "TiNO Baby Monitor",
    subtitle: "BABY MONITOR",
    install_app: "Install App",
    install_desc: "Recommended for best use",
    
    // Home
    mode_camera: "Camera Mode",
    mode_monitor: "Monitor Mode",
    baby_title: "BaBy",
    parent_title: "Parents",
    
    // Tabs
    tab_home: "Home",
    tab_devices: "Devices",
    tab_config: "Settings",
    
    // Devices Tab
    dev_title: "Devices",
    dev_subtitle: "Connection history.",
    my_cameras: "My Cameras",
    auth_receivers: "Authorized Receivers",
    no_cameras: "No cameras connected yet.",
    no_receivers: "No one has connected to you.",
    connect_btn: "Connect",
    last_conn: "Last:",
    conn_history: "Connection History",
    back_btn: "Back",
    
    // Settings Tab
    set_title: "Settings",
    set_subtitle: "Customize your TiNO experience.",
    dev_name_title: "Device Name",
    dev_name_desc: "How others see you",
    language: "Language",
    edit_btn: "EDIT",
    ok_btn: "OK",

    // Customization
    brand_title: "Identity",
    brand_desc: "Tap to change logo",
    reset_logo: "Reset to original",
    
    // Tutorial
    tut_title: "Quick Guide",
    tut_skip: "Skip",
    tut_next: "Next",
    tut_start: "Start",
    tut_1_title: "Choose a Role",
    tut_1_desc: "Use one phone as CAMERA (near baby) and another as MONITOR (with you).",
    tut_2_title: "Secure Connection",
    tut_2_desc: "In CAMERA mode you'll see a QR code. Scan it with the MONITOR device to pair.",
    tut_3_title: "Smart Monitoring",
    tut_3_desc: "Get cry alerts, talk to your baby, and control night light remotely.",

    // Baby Monitor (Sender)
    connecting: "CONNECTING...",
    online: "ONLINE",
    link_device: "Link Device",
    secure_conn: "Secure & Encrypted Connection",
    scan_instruction: "Scan to connect automatically.",
    connected_users: "Connected",
    max_users: "Secure System",
    max_users_desc: "Max 3 parents connected.",
    ai_active: "AI ACTIVE",
    lullaby_active: "LULLABY ON",
    flash_on: "FLASH ON",
    saver_on: "SAVER ON",
    settings_modal: "Settings",
    cam_select: "Camera",
    back_cam: "Back",
    front_cam: "Front",
    mic_title: "Microphone",
    mic_on: "On",
    mic_off: "Muted",
    res_title: "Resolution",
    ai_alerts: "AI Alerts",
    ai_desc: "Notify cry/motion",
    power_save: "Power Saver",
    power_desc: "Dim screen after 20s",
    dim_default: "Default brightness (10%)",
    very_dark: "Very Dark",
    medium_dark: "Medium",
    dim_wake: "Tap to wake",
    
    // Parent Station (Receiver)
    connect_title: "Connect",
    scan_qr_btn: "Scan QR",
    scan_qr_desc: "Link monitor automatically",
    manual_id: "Enter Manual ID",
    scanning: "Scanning...",
    cancel_btn: "Cancel",
    secure_badge: "SECURE",
    live_badge: "LIVE",
    talk_btn: "TALK",
    lullaby_btn: "LULLABY",
    light_btn: "LIGHT",
    activate_sound: "ENABLE SOUND",
    low_battery: "⚠️ Low Battery on Camera!",
    conn_error: "Connection Error.",
    conn_timeout: "Connection timed out.",
    conn_ended: "Connection ended.",
    
    // Notifications
    alert_cry_title: "Alert! Baby Crying",
    alert_move_title: "Motion Detected",
    alert_body: "TiNO detected activity in the crib.",
    auth_error: "Invalid Security Token."
  }
};
