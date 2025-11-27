export interface Webcam {
  id: string;
  name: string;
  region: string;
  altitude: number;
  streamUrl: string;
  description: string;
  clients?: number;
  lat?: number; // Latitud per meteo real
  lng?: number; // Longitud per meteo real
}

export type SortOption = 'viewers' | 'altitude_desc' | 'altitude_asc' | 'region' | 'name';

export interface WeatherData {
  temp: string;
  humidity: number;
  wind: number;
  pressure: number;
  isReal: boolean; // Per saber si son dades reals o simulades (fallback)
}