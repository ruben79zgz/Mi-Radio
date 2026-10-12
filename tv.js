window.TV_CONFIG = {
  tdtJson: 'https://www.tdtchannels.com/lists/tv.json',
  epgJson: 'epg-data.json',
  cinemaJson: 'cartelera-data.json',
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
    },
    {
      id: '24h',
      requireDirect: true,
      epgId: '24Horas.TV',
      name: '24h',
      matches: ['24h'],
      web: 'https://www.rtve.es/play/videos/directo/24h/',
      logo: 'https://pbs.twimg.com/profile_images/1634293543987453954/mb1Rzmso_200x200.jpg'
    },
    {
      id: 'teledeporte',
      requireDirect: true,
      epgId: 'TDP.TV',
      name: 'Teledeporte',
      matches: ['Teledeporte'],
      web: 'https://www.rtve.es/play/videos/directo/tdp/',
      logo: 'https://graph.facebook.com/teledeporteRTVE/picture?width=200&height=200'
    },
    {
      id: 'clan',
      requireDirect: true,
      epgId: 'Clan.TV',
      name: 'Clan',
      matches: ['Clan'],
      web: 'https://www.rtve.es/play/videos/directo/clan/',
      logo: 'https://graph.facebook.com/clantve/picture?width=200&height=200'
    },
    {
      id: 'trece',
      requireDirect: true,
      epgId: '13.TV',
      name: 'TRECE',
      matches: ['TRECE'],
      web: 'https://www.cope.es/directos/trece',
      logo: 'https://graph.facebook.com/TRECEtves/picture?width=200&height=200'
    },
    {
      id: 'euronews',
      requireDirect: true,
      epgId: 'Euronews.TV',
      name: 'Euronews',
      matches: ['Euronews'],
      web: 'https://es.euronews.com/live',
      logo: 'https://graph.facebook.com/es.euronews/picture?width=200&height=200'
    },
    {
      id: 'realmadridtv',
      requireDirect: true,
      epgId: 'RMTV.TV',
      name: 'Real Madrid TV',
      matches: ['Real Madrid TV'],
      web: 'https://www.realmadrid.com/real-madrid-tv',
      logo: 'https://graph.facebook.com/RealMadrid/picture?width=200&height=200'
    },

  ],
  amcGuide: [
    { id: 'amc-vintv', guideId: 'TVGUIA.vin-tv', name: 'Vin TV', tvGuiaSlug: 'vin-tv' },
    { id: 'amc-break', guideId: 'TVGUIA.amc-break', name: 'AMC Break', tvGuiaSlug: 'amc-break' },
    { id: 'amc', guideId: 'TVGUIA.amc', name: 'AMC', tvGuiaSlug: 'amc' },
    { id: 'amc-hollywood', guideId: 'TVGUIA.canal-hollywood', name: 'Canal Hollywood', tvGuiaSlug: 'canal-hollywood' },
    { id: 'amc-somos', guideId: 'TVGUIA.somos', name: 'Somos', tvGuiaSlug: 'somos' },
    { id: 'amc-western', guideId: 'TVGUIA.amc-western', name: 'AMC Western', tvGuiaSlug: 'amc-western' },
    { id: 'amc-odisea', guideId: 'TVGUIA.odisea', name: 'Odisea', tvGuiaSlug: 'odisea' },
    { id: 'amc-crime', guideId: 'TVGUIA.amc-crime', name: 'AMC Crime', tvGuiaSlug: 'amc-crime' },
    { id: 'amc-xtrm', guideId: 'TVGUIA.xtrm', name: 'XTRM', tvGuiaSlug: 'xtrm' },
    { id: 'amc-dark', guideId: 'TVGUIA.dark', name: 'DARK', tvGuiaSlug: 'dark' },
    { id: 'amc-cocina', guideId: 'TVGUIA.canal-cocina', name: 'Canal Cocina', tvGuiaSlug: 'canal-cocina' },
    { id: 'amc-living', guideId: 'TVGUIA.amc-living', name: 'AMC Living', tvGuiaSlug: 'amc-living' },
    { id: 'amc-sundance', guideId: 'TVGUIA.sundance-tv', name: 'Sundance TV', tvGuiaSlug: 'sundance-tv' },
    { id: 'amc-historia', guideId: 'TVGUIA.historia', name: 'Historia', tvGuiaSlug: 'historia' }
  ]
};
