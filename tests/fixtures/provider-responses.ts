export const GOOGLE_PLACES_RESPONSE = {
  places: [{
    id: "ChIJbeijingbookstore",
    displayName: { text: "三联韬奋书店", languageCode: "zh-CN" },
    formattedAddress: "北京市东城区美术馆东街22号",
    location: { latitude: 39.923124, longitude: 116.410886 },
    primaryType: "book_store",
  }],
};

export const GOOGLE_ROUTES_RESPONSE = {
  routes: [{
    distanceMeters: 18_750,
    duration: "2700s",
    travelAdvisory: {
      transitFare: { currencyCode: "CNY", units: "5", nanos: 0 },
    },
  }],
};

export const QWEATHER_CURRENT_RESPONSE = {
  code: "200",
  updateTime: "2026-07-11T09:00+08:00",
  fxLink: "https://www.qweather.com/weather/beijing-101010100.html",
  now: {
    obsTime: "2026-07-11T08:50+08:00",
    temp: "27",
    feelsLike: "29",
    text: "小雨",
    windDir: "东南风",
    windScale: "2",
    windSpeed: "8",
    humidity: "78",
    precip: "1.2",
    vis: "12",
  },
  refer: { sources: ["QWeather", "NMC"] },
};

export const QWEATHER_FORECAST_RESPONSE = {
  code: "200",
  fxLink: "https://www.qweather.com/weather/beijing-101010100.html",
  daily: [{
    fxDate: "2026-07-11",
    sunrise: "04:56",
    sunset: "19:43",
    tempMax: "30",
    tempMin: "22",
    textDay: "小雨",
    textNight: "多云",
    humidity: "75",
    precip: "3.4",
  }],
  refer: { sources: ["QWeather"] },
};

export const QWEATHER_ALERT_RESPONSE = {
  metadata: {
    zeroResult: false,
    attributions: ["https://developer.qweather.com/attribution.html"],
  },
  alerts: [{
    id: "beijing-rain-1",
    senderName: "北京市气象台",
    issuedTime: "2026-07-11T07:00+08:00",
    eventType: { name: "暴雨", code: "1009" },
    urgency: "immediate",
    severity: "moderate",
    certainty: "likely",
    effectiveTime: "2026-07-11T08:00+08:00",
    expireTime: "2026-07-11T14:00+08:00",
    headline: "北京市发布暴雨黄色预警",
    description: "预计部分地区小时雨强较大。",
  }],
};

export const GDELT_ARTICLE_RESPONSE = {
  articles: [{
    url: "https://example.cn/beijing-rain",
    title: "北京发布降雨提示",
    seendate: "20260711T010000Z",
    socialimage: "https://example.cn/rain.jpg",
    domain: "example.cn",
    language: "Chinese",
    sourcecountry: "China",
  }],
};
