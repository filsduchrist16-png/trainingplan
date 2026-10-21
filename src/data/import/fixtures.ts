import { Encoder, Profile } from '@garmin/fitsdk';

/** Fabrique un FIT d'activité réaliste (pour les tests) : course de `minutes` min, FC qui monte doucement. */
export function makeFit(opts: { minutes?: number; start?: Date; sport?: string; subSport?: string; hr?: (s: number) => number; withSession?: boolean } = {}): ArrayBuffer {
  const minutes = opts.minutes ?? 30;
  const start = opts.start ?? new Date('2026-10-20T09:30:00Z');
  const enc = new Encoder();
  // Les types du SDK sont stricts sur les messages ; les champs utilisés ici sont ceux du profil FIT.
  const mesg = (num: number | undefined, data: Record<string, unknown>) => enc.onMesg(num!, data as never);
  mesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 1, timeCreated: start, type: 'activity' });
  const speed = 3; // m/s ≈ 5:33/km
  for (let s = 0; s <= minutes * 60; s += 1) {
    mesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(start.getTime() + s * 1000),
      heartRate: Math.round(opts.hr ? opts.hr(s) : 130 + s / 120),
      distance: s * speed,
      enhancedSpeed: speed,
      enhancedAltitude: 200 + 20 * Math.sin(s / 120),
      cadence: 86,
      fractionalCadence: 0.5,
    });
  }
  if (opts.withSession !== false) {
    mesg(Profile.MesgNum.SESSION, {
      timestamp: new Date(start.getTime() + minutes * 60_000),
      startTime: start,
      sport: opts.sport ?? 'running',
      subSport: opts.subSport ?? 'trail',
      totalElapsedTime: minutes * 60,
      totalTimerTime: minutes * 60 - 30,
      totalDistance: minutes * 60 * speed,
      totalAscent: 120,
      totalDescent: 118,
      avgHeartRate: 138,
      maxHeartRate: 152,
      avgRunningCadence: 86,
      avgFractionalCadence: 0.5,
      trainingLoadPeak: 74.6,
    });
  }
  const bytes = enc.close();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const GPX_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>2026-10-18T11:00:00Z</time></metadata>
  <trk><name>Sentier des Loups</name><type>trail_running</type><trkseg>
${Array.from({ length: 121 }, (_, i) => `    <trkpt lat="${(46.95 + i * 0.0002).toFixed(6)}" lon="-71.3"><ele>${300 + (i < 60 ? i * 2 : 120 - (i - 60) * 2)}</ele><time>${new Date(Date.parse('2026-10-18T11:00:00Z') + i * 10_000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${135 + (i % 5)}</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n')}
  </trkseg></trk>
</gpx>`;

export const TCX_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities><Activity Sport="Running"><Id>2026-10-15T10:00:00.000Z</Id>
    <Lap StartTime="2026-10-15T10:00:00.000Z"><DistanceMeters>3000</DistanceMeters><Track>
${Array.from({ length: 61 }, (_, i) => `      <Trackpoint><Time>${new Date(Date.parse('2026-10-15T10:00:00Z') + i * 15_000).toISOString()}</Time><AltitudeMeters>${100 + (i % 10)}</AltitudeMeters><DistanceMeters>${i * 50}</DistanceMeters><HeartRateBpm><Value>${140 + (i % 3)}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:RunCadence>87</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`).join('\n')}
    </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>`;

export const CSV_SAMPLE = `\uFEFFActivity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Run Cadence,Total Ascent,Total Descent,Training Load
Trail Running,2026-10-12 08:00:00,false,"Jacques-Cartier, boucle",21.35,1500,02:45:10,141,162,168,"1,050",1040,180
Running,2026-10-10 05:30:00,false,Z2 matinal,8.02,600,48:12,134,148,170,60,58,--
Strength Training,2026-10-09 19:00:00,false,Muscu,0.00,200,45:00,--,--,--,--,--,--
Running,pas une date,false,Ligne invalide,5,300,30:00,--,--,--,--,--,--
`;
