export enum AppMode {
  SELECTION = 'SELECTION',
  MONITOR = 'MONITOR', // The device with the baby
  PARENT = 'PARENT'    // The receiving device
}

export type Language = 'es' | 'en';

export interface AIAnalysisResult {
  status: 'sleeping' | 'awake' | 'crying' | 'not_detected' | 'unknown';
  safetyScore: number; // 0-100
  description: string;
  timestamp: number;
}

export type RemoteCommand = 
  | { type: 'CMD_FLASH'; value: boolean }
  | { type: 'CMD_LULLABY'; value: boolean }
  | { type: 'CMD_QUALITY'; value: 'high' | 'medium' | 'low' }
  | { type: 'CMD_NOTIFICATION'; title: string; body: string };

export interface MonitorHistoryItem {
  id: string;
  name: string; // e.g., "Monitor 1" or date
  lastConnected: number;
  token?: string; // Auth token
}

export interface BatteryState {
  level: number; // 0 to 1
  charging: boolean;
}

export interface PeerConnectOption {
  label?: string;
  metadata?: any;
  serialization?: string;
  reliable?: boolean;
}