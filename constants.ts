
import { Webcam } from './types';

export const SNAPSHOT_BASE_URL = 'https://app.projecte4estacions.com/snapshots/';
export const API_BASE_URL = 'https://api.projecte4estacions.com/api';

// MAPPING ESTATS I METEO
export const ALL_WEBCAMS: Webcam[] = [
    // --- PALLARS SOBIRÀ ---
    { 
        id: 'refugiamitges', name: "Refugi d'Amitges", region: "Pallars Sobirà", altitude: 2365, lat: 42.5966, lng: 0.9845, camId: 31, 
        streamUrl: "https://api.projecte4estacions.com/live/refugiamitges/live.m3u8?", description: "Al cor del Parc Nacional d'Aigüestortes i Estany de Sant Maurici.",
        meteoStationType: 'weatherlink', meteoStationId: 'b43265d2-e608-4491-b02f-05260bd9c772'
    },
    { 
        id: 'certascan', name: "Refugi de Certascan", region: "Pallars Sobirà", altitude: 2240, lat: 42.6888, lng: 1.3039, camId: 11, 
        streamUrl: "https://api.projecte4estacions.com/live/certascan/live.m3u8?", description: "Ubicat a la vora de l'estany de Certascan.",
        meteoStationType: 'meteocat', meteoStationId: 'Z5'
    },
    { 
        id: 'bonaigua', name: "Port de la Bonaigua", region: "Pallars Sobirà", altitude: 2072, lat: 42.6639, lng: 0.9786, camId: 19, 
        streamUrl: "https://api.projecte4estacions.com/live/bonaigua/live.m3u8?", description: "Vista des del mític Port de la Bonaigua.",
        meteoStationType: 'meteocat', meteoStationId: 'Z1'
    },
    { 
        id: 'peulla', name: "La Peülla", region: "Pallars Sobirà", altitude: 1900, lat: 42.6442, lng: 0.9639, camId: 20, 
        streamUrl: "https://api.projecte4estacions.com/live/peulla/live.m3u8?", description: "Càmera situada a prop del Port de la Bonaigua.",
        meteoStationType: 'meteocat', meteoStationId: 'Z1', meteoStationName: 'Port de la Bonaigua'
    },
    { 
        id: 'tavascan', name: "Estació de Tavascan", region: "Pallars Sobirà", altitude: 1750, lat: 42.6631, lng: 1.2227, camId: 61, 
        streamUrl: "https://api.projecte4estacions.com/live/tavascan/live.m3u8?", description: "Petita estació d'esquí familiar al cor del Parc Natural de l'Alt Pirineu.",
        // No ID assigned in list, fallback to OpenMeteo or nearby
    },
    { 
        id: 'viros-estacio', name: "Estació Virós - Vallferrera", region: "Pallars Sobirà", altitude: 1680, lat: 42.5226, lng: 1.3061, camId: 60, 
        streamUrl: "https://cams.projecte4estacions.com/live/viros-estacio/live.m3u8", description: "Al cor de la Vallferrera."
    },
    { 
        id: 'areu', name: "Àreu", region: "Pallars Sobirà", altitude: 1250, lat: 42.5908, lng: 1.3253, camId: 9, 
        streamUrl: "https://api.projecte4estacions.com/live/areu/live.m3u8?", description: "Des del poble d'Àreu, a la Vall Ferrera.",
        meteoStationType: 'wunderground', meteoStationId: 'IALINS2'
    },
    { 
        id: 'isil', name: "Isil", region: "Pallars Sobirà", altitude: 1165, lat: 42.6423, lng: 1.0874, camId: 74, 
        streamUrl: "https://api.projecte4estacions.com/live/isil/live.m3u8?", description: "Coneguda per les Falles d'Isil.",
        meteoStationType: 'wunderground', meteoStationId: 'IALTNE1'
    },
    { 
        id: 'vall-isil', name: "Vall d'Isil", region: "Pallars Sobirà", altitude: 1300, lat: 42.6736, lng: 1.0853, camId: 76, 
        streamUrl: "https://api.projecte4estacions.com/live/vall-isil/live.m3u8?", description: "Imatge des de la Vall d'Isil.",
        meteoStationType: 'wunderground', meteoStationId: 'IALTNE2'
    },
    { 
        id: 'esterri', name: "Esterri d’Àneu", region: "Pallars Sobirà", altitude: 950, lat: 42.6272, lng: 1.1245, camId: 32, 
        streamUrl: "https://api.projecte4estacions.com/live/esterri/live.m3u8?", description: "Capital de les Valls d'Àneu.",
        meteoStationType: 'wunderground', meteoStationId: 'IESTERRI2'
    },

    // --- VAL D'ARAN ---
    { 
        id: 'refugicolomers', name: "Refugi de Colomèrs", region: "Val d'Aran", altitude: 2135, lat: 42.6397, lng: 0.9192, camId: 78, 
        streamUrl: "https://api.projecte4estacions.com/live/refugicolomers/live.m3u8?", description: "Situat just al costat de l’Estanh Major."
        // OpenMeteo fallback
    },
    { 
        id: 'montgarri', name: "Montgarri", region: "Val d'Aran", altitude: 1650, lat: 42.7604, lng: 1.003, camId: 21, 
        streamUrl: "https://api.projecte4estacions.com/live/montgarri/live.m3u8?", description: "Vista des del Santuari de Montgarri."
    },
    { 
        id: 'vilac', name: "Vilac", region: "Val d'Aran", altitude: 1040, lat: 42.7094, lng: 0.7856, camId: 75, 
        streamUrl: "https://api.projecte4estacions.com/live/vilac/live.m3u8?", description: "Vista des de Vilac.",
        meteoStationType: 'meteocat', meteoStationId: 'YN', meteoStationName: 'Vielha'
    },
    { 
        id: 'vielha', name: "Vielha e Mijaran", region: "Val d'Aran", altitude: 980, lat: 42.7018, lng: 0.7933, camId: 18, 
        streamUrl: "https://api.projecte4estacions.com/live/vielha/live.m3u8?", description: "Panoràmica de Vielha.",
        meteoStationType: 'meteocat', meteoStationId: 'YN'
    },

    // --- ALTA RIBAGORÇA ---
    { 
        id: 'boi-taull-express', name: "Boí Taüll - Cap de l'Express", region: "Alta Ribagorça", altitude: 2500, lat: 42.5292, lng: 0.8644, camId: 71, 
        streamUrl: "https://api.projecte4estacions.com/live/boi-taull-express/live.m3u8?", description: "Situada a la cota alta de l'estació.",
        meteoStationType: 'meteocat', meteoStationId: 'Z2'
    },
    { 
        id: 'boi-taull-mulleres', name: "Boí Taüll - Cap de Mulleres", region: "Alta Ribagorça", altitude: 2280, lat: 42.5337, lng: 0.8524, camId: 72, 
        streamUrl: "https://api.projecte4estacions.com/live/boi-taull-mulleres/live.m3u8?", description: "Situada a una de les cotes altes.",
        meteoStationType: 'meteocat', meteoStationId: 'Z2'
    },
    { 
        id: 'taull', name: "Taüll", region: "Alta Ribagorça", altitude: 1500, lat: 42.5194, lng: 0.8483, camId: 46, 
        streamUrl: "https://api.projecte4estacions.com/live/taull/live.m3u8?", description: "Vista del poble de Taüll.",
        // POBLE: Forcem OpenMeteo eliminant meteoStation
    },
    { 
        id: 'boi', name: "Boí", region: "Alta Ribagorça", altitude: 1270, lat: 42.5218, lng: 0.8335, camId: 35, 
        streamUrl: "https://api.projecte4estacions.com/live/boi/live.m3u8?", description: "Vista del poble de Boí.",
        // POBLE: Forcem OpenMeteo eliminant meteoStation
    },
    { 
        id: 'erill', name: "Erill la Vall", region: "Alta Ribagorça", altitude: 1250, lat: 42.5255, lng: 0.8239, camId: 49, 
        streamUrl: "https://api.projecte4estacions.com/live/erill/live.m3u8?", description: "Càmera al poble d'Erill la Vall.",
        meteoStationType: 'meteocat', meteoStationId: 'Z2', meteoStationName: 'Boí Taüll'
    },
    { 
        id: 'vilaller', name: "Vilaller", region: "Alta Ribagorça", altitude: 985, lat: 42.4764, lng: 0.7161, camId: 37, 
        streamUrl: "https://api.projecte4estacions.com/live/vilaller/live.m3u8?", description: "Càmera a Vilaller.",
        meteoStationType: 'wunderground', meteoStationId: 'IVILAL25'
    },

    // --- PALLARS JUSSÀ ---
    { 
        id: 'capdella', name: "Capdella - Vall Fosca", region: "Pallars Jussà", altitude: 1430, lat: 42.4639, lng: 0.9926, camId: 48, 
        streamUrl: "https://api.projecte4estacions.com/live/capdella/live.m3u8?", description: "Càmera situada a Capdella.",
        meteoStationType: 'wunderground', meteoStationId: 'ILATOR37'
    },

    // --- ANDORRA ---
    { 
        id: 'picdelcubil', name: "Estació d'esquí Pal Arinsal", region: "Andorra", altitude: 2364, lat: 42.5436, lng: 1.4842, camId: 34, 
        streamUrl: "https://api.projecte4estacions.com/live/picdelcubil/live.m3u8?", description: "Vistes espectaculars des del Pic del Cubil.",
        meteoStationName: 'Coll Pa (Ref)'
    },
    { 
        id: 'canillo', name: "Els Plans (Canillo)", region: "Andorra", altitude: 1800, lat: 42.5667, lng: 1.5978, 
        streamUrl: "https://api.projecte4estacions.com/live/canillo/live.m3u8?", description: "Vista des de la zona d'Els Plans."
    },
    { 
        id: 'lacortinada', name: "La Cortinada", region: "Andorra", altitude: 1300, lat: 42.5756, lng: 1.5186, camId: 22, 
        streamUrl: "https://api.projecte4estacions.com/live/lacortinada/live.m3u8?", description: "Imatge des de La Cortinada.",
        meteoStationType: 'wunderground', meteoStationId: 'IORDIN1'
    },
    { 
        id: 'andorralavella', name: "Andorra La Vella", region: "Andorra", altitude: 1050, lat: 42.5063, lng: 1.5218, camId: 25, 
        streamUrl: "https://cams.projecte4estacions.com/live/andorralavella/live.m3u8", description: "Vista de la capital del Principat.",
        meteoStationType: 'wunderground', meteoStationId: 'IANDOR32'
    },

    // --- ALT URGELL ---
    { 
        id: 'tuixentlavansa', name: "Estació Tuixent - La Vansa", region: "Alt Urgell", altitude: 1930, lat: 42.2131, lng: 1.5478, camId: 1, 
        streamUrl: "https://api.projecte4estacions.com/live/tuixentlavansa/live.m3u8?", description: "Panoràmica de l'estació d'esquí nòrdic.",
        meteoStationType: 'weatherlink', meteoStationId: '90f02e19-148b-4704-946c-6b338743efce'
    },
    { 
        id: 'santjoan-estacio', name: "Estació Sant Joan de l'Erm", region: "Alt Urgell", altitude: 1725, lat: 42.4178, lng: 1.2906, camId: 59, 
        streamUrl: "https://cams.projecte4estacions.com/live/santjoan-estacio/live.m3u8", description: "Imatge des de l'estació d'esquí nòrdic.",
        meteoStationType: 'weatherlink', meteoStationId: '81194044-65a0-4f04-886d-5fca0cff2049'
    },
    { 
        id: 'tuixentpoble', name: "Tuixent", region: "Alt Urgell", altitude: 1195, lat: 42.2307, lng: 1.5682, camId: 24, 
        streamUrl: "https://api.projecte4estacions.com/live/tuixentpoble/live.m3u8?", description: "Vista del poble de Tuixent.",
        meteoStationType: 'weatherlink', meteoStationId: '9c34e655-5a2d-4611-98c7-57a6220b7097'
    },
    { 
        id: 'laseu', name: "La Seu d'Urgell", region: "Alt Urgell", altitude: 690, lat: 42.3579, lng: 1.4561, camId: 53, 
        streamUrl: "https://api.projecte4estacions.com/live/laseu/live.m3u8?", description: "Vista de la capital de l'Alt Urgell.",
        meteoStationType: 'meteocat', meteoStationId: 'CD'
    },
    { 
        id: 'mirambell', name: "Mirambell", region: "Alt Urgell", altitude: 680, lat: 41.9723, lng: 1.3414, camId: 55, 
        streamUrl: "https://api.projecte4estacions.com/live/mirambell/live.m3u8?", description: "Petita localitat a la riba del Segre.",
        meteoStationType: 'meteocat', meteoStationId: 'W5', meteoStationName: 'Oliana'
    },
    { 
        id: 'canelles', name: "Canelles", region: "Alt Urgell", altitude: 600, lat: 42.1764, lng: 1.3503, camId: 52, 
        streamUrl: "https://cams.projecte4estacions.com/live/canelles/live.m3u8", description: "Situada a Fígols i Alinyà.",
        meteoStationType: 'meteocat', meteoStationId: 'CJ', meteoStationName: 'Organyà'
    },

    // --- CERDANYA ---
    { 
        id: 'refugimalniu', name: "Refugi de Malniu", region: "Cerdanya", altitude: 2125, lat: 42.4646, lng: 1.7876, camId: 43, 
        streamUrl: "https://api.projecte4estacions.com/live/refugimalniu/live.m3u8?", description: "A prop dels Estanys de Malniu.",
        meteoStationType: 'meteocat', meteoStationId: 'Z3'
    },
    { 
        id: 'prataguilo', name: "Refugi Prat d'Aguiló", region: "Cerdanya", altitude: 2037, lat: 42.2964, lng: 1.7378, 
        streamUrl: "https://api.projecte4estacions.com/live/prataguilo/live.m3u8?", description: "Refugi situat al vessant sud de la Serra de Cadí."
    },
    { 
        id: 'lles-estacio', name: "Estació Lles de Cerdanya", region: "Cerdanya", altitude: 1960, lat: 42.4276, lng: 1.6669, camId: 58, 
        streamUrl: "https://cams.projecte4estacions.com/live/lles-estacio/live.m3u8", description: "Vista de l'estació d'esquí nòrdic.",
        meteoStationType: 'weatherlink', meteoStationId: '9b565adb-023c-401b-b40b-514ad5461258'
    },
    { 
        id: 'guils', name: "Estació Guils Fontanera", region: "Cerdanya", altitude: 1915, lat: 42.4589, lng: 1.8679, camId: 57, 
        streamUrl: "https://cams.projecte4estacions.com/live/guils/live.m3u8", description: "Càmera a l'estació d'esquí nòrdic."
    },
    { 
        id: 'aransa-estacio', name: "Estació d'Aransa", region: "Cerdanya", altitude: 1900, lat: 42.4092, lng: 1.6381, 
        streamUrl: "https://cams.projecte4estacions.com/live/aransa-estacio/live.m3u8", description: "Estació d'esquí nòrdic al cor del Parc Natural."
    },
    { 
        id: 'llescerdanya', name: "Lles de Cerdanya", region: "Cerdanya", altitude: 1480, lat: 42.3905, lng: 1.6865, camId: 4, 
        streamUrl: "https://api.projecte4estacions.com/live/llescerdanya/live.m3u8?", description: "Vista des del poble de Lles de Cerdanya.",
        meteoStationType: 'wunderground', meteoStationId: 'ILLESD1'
    },
    { 
        id: 'llivia', name: "Cereja (Llívia)", region: "Cerdanya", altitude: 1350, lat: 42.4705, lng: 1.9682, camId: 10, 
        streamUrl: "https://api.projecte4estacions.com/live/llivia/live.m3u8?", description: "Des del nucli de Cereja.",
        meteoStationType: 'wunderground', meteoStationId: 'ILLVIA5'
    },
    { 
        id: 'bolvir', name: "Bolvir", region: "Cerdanya", altitude: 1140, lat: 42.4194, lng: 1.8814, camId: 50, 
        streamUrl: "https://api.projecte4estacions.com/live/bolvir/live.m3u8?", description: "Situada a Bolvir.",
        meteoStationType: 'wunderground', meteoStationId: 'IGER95', meteoStationName: 'Ger'
    },
    { 
        id: 'bellver', name: "Bellver de Cerdanya", region: "Cerdanya", altitude: 1060, lat: 42.3697, lng: 1.7767, camId: 65, 
        streamUrl: "https://cams.projecte4estacions.com/live/bellver/live.m3u8", description: "Panoràmica de Bellver de Cerdanya.",
        meteoStationType: 'wunderground', meteoStationId: 'IBELLV48'
    },

    // --- SOLSONÈS ---
    { 
        id: 'portdelcomte1', name: "Estació Port del Comte", region: "Solsonès", altitude: 1800, lat: 42.1729, lng: 1.5606, camId: 28, 
        streamUrl: "https://api.projecte4estacions.com/live/portdelcomte1/live.m3u8?", description: "Vista general de l'estació d'esquí alpí.",
        meteoStationType: 'meteocat', meteoStationId: 'ZE'
    },
    { 
        id: 'portdelcomte-debutants', name: "Port del Comte (Debutants)", region: "Solsonès", altitude: 1750, lat: 42.1753, lng: 1.5647, camId: 15, 
        streamUrl: "https://api.projecte4estacions.com/live/portdelcomte-debutants/live.m3u8?", description: "Càmera enfocada a la zona de debutants.",
        meteoStationType: 'wunderground', meteoStationId: 'ICATALUN31', meteoStationName: 'Urb. Port del Comte'
    },
    { 
        id: 'casesaltesdeposada', name: "Cases Altes de Posada", region: "Solsonès", altitude: 825, lat: 42.0911, lng: 1.5772, camId: 42, 
        streamUrl: "https://cams.projecte4estacions.com/live/casesaltesdeposada/live.m3u8", description: "Situada a la Vall de Lord.",
        meteoStationType: 'wunderground', meteoStationId: 'ISANTL81', meteoStationName: 'Sant Llorenç de Morunys'
    },

    // --- BERGUEDÀ ---
    { 
        id: 'refugirasos', name: "Refugi Rasos de Peguera", region: "Berguedà", altitude: 1760, lat: 42.1394, lng: 1.7618, camId: 47, 
        streamUrl: "https://api.projecte4estacions.com/live/refugirasos/live.m3u8?", description: "Situada a l'antiga estació d'esquí de Rasos de Peguera.",
        meteoStationType: 'wunderground', meteoStationId: 'ICASTE775'
    },
    { 
        id: 'pedraforca', name: "Pedraforca - Saldes", region: "Berguedà", altitude: 1350, lat: 42.2333, lng: 1.7397, camId: 68, 
        streamUrl: "https://api.projecte4estacions.com/live/pedraforca/live.m3u8?", description: "Vista icònica del massís del Pedraforca des de Saldes.",
        meteoStationType: 'wunderground', meteoStationId: 'ISALDE17'
    },
    { 
        id: 'poblalillet', name: "Santa Maria de Lillet", region: "Berguedà", altitude: 830, lat: 42.2436, lng: 1.9744, camId: 51, 
        streamUrl: "https://api.projecte4estacions.com/live/poblalillet/live.m3u8?", description: "Càmera a La Pobla de Lillet.",
        meteoStationType: 'wunderground', meteoStationId: 'IBARCELO40'
    },

    // --- RIPOLLÈS ---
    { 
        id: 'vallter', name: "Estació de Vallter", region: "Ripollès", altitude: 2200, lat: 42.4221, lng: 2.2644, camId: 44, 
        streamUrl: "https://api.projecte4estacions.com/live/vallter/live.m3u8?", description: "L'estació d'esquí més oriental del Pirineu català.",
        meteoStationType: 'meteocat', meteoStationId: 'ZC'
    },
    { 
        id: 'comadevaca', name: "Refugi de Coma de Vaca", region: "Ripollès", altitude: 2010, lat: 42.3847, lng: 2.2223, camId: 39, 
        streamUrl: "https://cams.projecte4estacions.com/live/comadevaca/live.m3u8", description: "Enclavat a la confluència dels rius Freser i de la Vaca.",
        meteoStationType: 'wunderground', meteoStationId: 'IQUERA1'
    },
    { 
        id: 'planoles', name: "Can Fosses (Planoles)", region: "Ripollès", altitude: 1265, lat: 42.3164, lng: 2.1039, camId: 52, 
        streamUrl: "https://api.projecte4estacions.com/live/planoles/live.m3u8?", description: "Panoràmica de Planoles.",
        meteoStationType: 'wunderground', meteoStationId: 'IPLANO3'
    },
    { 
        id: 'mollo', name: "Molló", region: "Ripollès", altitude: 1190, lat: 42.3486, lng: 2.4045, camId: 36, 
        streamUrl: "https://api.projecte4estacions.com/live/mollo/live.m3u8?", description: "Poble fronterer de la Vall de Camprodon.",
        meteoStationType: 'meteocat', meteoStationId: 'CG'
    },
    { 
        id: 'ribes', name: "Ribes de Freser", region: "Ripollès", altitude: 1140, lat: 42.3044, lng: 2.1678, 
        streamUrl: "https://api.projecte4estacions.com/live/ribes/live.m3u8?", description: "Càmera al poble de Ribes de Freser.",
        meteoStationType: 'wunderground', meteoStationId: 'IRIBES7'
    },
    { 
        id: 'camprodon', name: "Camprodon", region: "Ripollès", altitude: 980, lat: 42.3129, lng: 2.3664, camId: 40, 
        streamUrl: "https://api.projecte4estacions.com/live/camprodon/live.m3u8?", description: "Vista d'aquesta popular vila del Ripollès.",
        meteoStationType: 'weatherlink', meteoStationId: '0899e171-6707-4cb0-9cf7-1b71ec984a0a'
    },
    { 
        id: 'beget', name: "Beget", region: "Ripollès", altitude: 540, lat: 42.3197, lng: 2.4819, camId: 38, 
        streamUrl: "https://api.projecte4estacions.com/live/beget/live.m3u8?", description: "Considerat un dels pobles més bonics de Catalunya.",
        meteoStationType: 'wunderground', meteoStationId: 'ICAMPR27'
    }
];
