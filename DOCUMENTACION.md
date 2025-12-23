# TiNO Baby Monitor - Documentación Oficial v1.3.6

## 1. Descripción General
**TiNO** es una aplicación Web Progresiva (PWA) de alto rendimiento diseñada para el monitoreo de bebés. Permite transformar dos dispositivos móviles en un sistema de vigilancia inteligente con transmisión de video/audio encriptado Punto a Punto (P2P) y análisis de estado mediante Inteligencia Artificial (Google Gemini).

## 2. Características Principales
- **Transmisión P2P Segura:** Utiliza tecnología WebRTC (vía PeerJS) para conectar la cámara con el monitor directamente, garantizando privacidad total ya que el video no se almacena en servidores externos.
- **Análisis con IA:** Integración con Gemini 3 Flash para la detección automática de llanto y movimiento, enviando notificaciones instantáneas a los padres.
- **Comunicación Bidireccional:** Sistema de Walkie-Talkie para hablarle al bebé desde el monitor de padres.
- **Control Remoto:** Capacidad de encender el flash (luz nocturna) o reproducir nanas (ruido blanco) en el dispositivo del bebé desde el teléfono de los padres.
- **Modo Ahorro de Energía:** Atenuación automática de pantalla en el dispositivo "Cámara" para prevenir sobrecalentamiento y ahorrar batería.

## 3. Especificaciones de Visualización (Novedad v1.3.6)
- **Espejo Universal (Natural View):** El receptor (Padres) aplica automáticamente un efecto espejo (`scaleX(-1)`) a la señal de video.
- **Razón técnica:** Esto garantiza un "Movimiento Natural". Si el bebé se desplaza hacia la derecha de la cámara, los padres lo verán desplazarse hacia la derecha de su pantalla, eliminando la desorientación visual común en cámaras de vigilancia estándar y emulando la experiencia intuitiva de una videollamada o un espejo físico.

## 4. Guía de Uso Rápido
### Modo Cámara (Dispositivo del Bebé)
1. Colocar el dispositivo en una posición con buena visibilidad de la cuna.
2. Seleccionar **"Modo Cámara"** en la pantalla principal.
3. Se mostrará un código QR único.
4. Se recomienda mantener el dispositivo conectado a una fuente de energía.

### Modo Monitor (Dispositivo de los Padres)
1. Seleccionar **"Modo Monitor"** en el segundo dispositivo.
2. Presionar **"Escanear QR"**.
3. Apuntar la cámara al código QR mostrado en el dispositivo del bebé.
4. Una vez establecida la conexión, aparecerá el video en vivo. Presione "Activar Sonido" para escuchar.

## 5. Resolución de Problemas (FAQ)
- **¿Por qué se ve invertido?** Está diseñado así para que cuando muevas al bebé a un lado, lo veas moverse al mismo lado en tu pantalla (Efecto Espejo). Es la forma más natural de monitoreo.
- **Error de Conexión:** Verifique que ambos dispositivos tengan acceso a Internet.
- **Cámara no inicia:** Asegúrese de haber otorgado permisos de cámara y micrófono en el navegador.

---
*TiNO Baby Monitor - Cuidando lo que más quieres con tecnología de vanguardia.*