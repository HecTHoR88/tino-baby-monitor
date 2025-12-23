export enum AppMode {
  SELECTION = 'SELECTION',
  MONITOR = 'MONITOR',
  PARENT = 'PARENT'
}

export type Language = 'es' | 'en';

export interface AIAnalysisResult {
  status: 'sleeping' | 'awake' | 'crying' | 'not_detected' | 'unknown';
  safetyScore: number;
  description: string;
  timestamp: number;
}

export type RemoteCommand = 
  | { type: 'CMD_FLASH'; value: boolean }
  | { type: 'CMD_LULLABY'; value: boolean }
  | { type: 'CMD_QUALITY'; value: 'high' | 'medium' | 'low' }
  | { type: 'CMD_NOTIFICATION'; title: string; body: string }
  | { type: 'INFO_CAMERA_TYPE'; value: 'user' | 'environment' };

export interface MonitorHistoryItem {
  id: string;
  name: string;
  lastConnected: number;
  token?: string;
  logs?: number[]; // Lista de timestamps de conexiones pasadas
}

export interface BatteryState {
  level: number;
  charging: boolean;
}

export interface PeerConnectOption {
  label?: string;
  metadata?: any;
  serialization?: string;
  reliable?: boolean;
}