
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
  camId?: number; // ID Numeric oficial de P4E
  
  // Dades Estació Meteorològica Real
  meteoStationType?: 'meteocat' | 'wunderground' | 'weatherlink';
  meteoStationId?: string;
  meteoStationName?: string; // Nom de referència si no és el mateix lloc (ex: "Port Ainé")
}

export type SortOption = 'viewers' | 'altitude_desc' | 'altitude_asc' | 'region' | 'name';

export interface WeatherData {
  temp: string;
  humidity: number;
  wind: number; // Ràfega o velocitat
  rain: number; // Pluja diària
  pressure?: number; // Opcional
  isReal: boolean; // True si ve d'estació, False si és OpenMeteo
  source?: string; // 'Meteocat', 'WG', 'Davis', 'OpenMeteo'
  refName?: string; // Nom de l'estació de referència
  time?: string; // Hora de la dada (opcional)
  conditionText?: string; // Descripció textual del temps (ex: "Sol", "Pluja")
  
  // Dades per icona visual
  code?: number;
  isDay?: boolean;
}
