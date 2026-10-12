window.TV_CONFIG = {
  tdtJson: 'https://www.tdtchannels.com/lists/tv.json',
  epgJson: 'epg-data.json',
  russianJson: 'https://raw.githubusercontent.com/ruben79zgz/Mi-TV/main/channels.json',
  spanish: [
    {
      id: 'la1',
      epgId: 'La1.TV',
      name: 'La 1',
      matches: ['La 1'],
      web: 'https://www.rtve.es/play/videos/directo/la-1/',
      logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSKAkEfk96B4C3wdml0A6_Ewv8zhsVAj2AVDSLpS34DMw&s',
      fallbackStreams: [
        { format: 'm3u8', url: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main_dvr.m3u8' }
      ]
    },
    {
      id: 'la2',
      epgId: 'La2.TV',
      name: 'La 2',
      matches: ['La 2'],
      web: 'https://www.rtve.es/play/videos/directo/la-2/',
      logo: 'https://yt3.googleusercontent.com/ytc/AIdro_kqgHWySi5xprs1VFCNCX0IKNT8yXBLZC43JMoB8j0JUto=s200',
      fallbackStreams: [
        { format: 'm3u8', url: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8' }
      ]
    },
    {
      id: 'antena3',
      epgId: 'Antena3.TV',
      name: 'Antena 3',
      matches: ['Antena 3', 'Antena 3 HD'],
      web: 'https://www.atresplayer.com/directos/antena3/',
      logo: 'https://www.google.com/s2/favicons?domain=antena3.com&sz=128'
    },
    {
      id: 'cuatro',
      epgId: 'Cuatro.TV',
      name: 'Cuatro',
      matches: ['Cuatro', 'Cuatro HD'],
      web: 'https://www.mitele.es/directo/cuatro/',
      logo: 'https://graph.facebook.com/cuatro/picture?width=200&height=200'
    },
    {
      id: 'telecinco',
      epgId: 'Telecinco.TV',
      name: 'Telecinco',
      matches: ['Telecinco', 'Telecinco HD'],
      web: 'https://www.mitele.es/directo/telecinco/',
      logo: 'https://graph.facebook.com/tele5/picture?width=200&height=200'
    },
    {
      id: 'lasexta',
      epgId: 'LaSexta.TV',
      name: 'laSexta',
      matches: ['laSexta', 'La Sexta', 'laSexta HD'],
      web: 'https://www.atresplayer.com/directos/lasexta/',
      logo: 'https://www.google.com/s2/favicons?domain=lasexta.com&sz=128'
    },
    {
      id: 'aragontv',
      epgId: 'AragonTV.TV',
      name: 'Aragón TV',
      matches: ['Aragón TV'],
      web: 'https://www.aragonplay.es/watch/live/69934178aea15ae34fa39ad0',
      logo: 'https://graph.facebook.com/AragonTV/picture?width=200&height=200'
    }
  ]
};

