// Country -> flag emoji, exposed on the shared content-script namespace (self.WC.flag).
// Emoji flags are plain text: no network, no <img>, no CSP issues — and they render natively
// on macOS. Loaded before content.js (see manifest content_scripts order).
// Covered by test/flags.test.mjs.

(() => {
  const WC = (self.WC = self.WC || {});
  // Normalize a team name to a comparable key: lowercase, strip accents & non-letters.
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z]/g, "");

  // ISO 3166-1 alpha-2 -> regional-indicator emoji.
  const emoji = (cc) =>
    cc
      .toUpperCase()
      .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

  // UK subdivision flags (England/Scotland/Wales) use tag sequences, not country codes.
  const subdiv = (code) => {
    let s = String.fromCodePoint(0x1f3f4);
    for (const ch of code) s += String.fromCodePoint(0xe0000 + ch.charCodeAt(0));
    return s + String.fromCodePoint(0xe007f);
  };

  // name -> alpha-2 (incl. common aliases / TheSportsDB spellings).
  const A2 = {
    Argentina: "AR", Australia: "AU", Austria: "AT", Belgium: "BE", Bolivia: "BO",
    "Bosnia and Herzegovina": "BA", Brazil: "BR", Bulgaria: "BG", Cameroon: "CM",
    Canada: "CA", "Cape Verde": "CV", "Cabo Verde": "CV", Chile: "CL", China: "CN",
    Colombia: "CO", Congo: "CG", "Costa Rica": "CR", Croatia: "HR", Curacao: "CW",
    "Czech Republic": "CZ", Czechia: "CZ", Denmark: "DK", "DR Congo": "CD",
    "Congo DR": "CD", Ecuador: "EC", Egypt: "EG", "El Salvador": "SV",
    "Equatorial Guinea": "GQ", Finland: "FI", France: "FR", Gabon: "GA", Gambia: "GM",
    Germany: "DE", Ghana: "GH", Greece: "GR", Guatemala: "GT", Guinea: "GN",
    Haiti: "HT", Honduras: "HN", Hungary: "HU", Iceland: "IS", India: "IN",
    Indonesia: "ID", Iran: "IR", Iraq: "IQ", Ireland: "IE", "Republic of Ireland": "IE",
    Italy: "IT", "Ivory Coast": "CI", "Cote d'Ivoire": "CI", Jamaica: "JM", Japan: "JP",
    Jordan: "JO", Kenya: "KE", Kuwait: "KW", Lebanon: "LB", Libya: "LY", Madagascar: "MG",
    Malaysia: "MY", Mali: "ML", Mauritania: "MR", Mexico: "MX", Morocco: "MA",
    Mozambique: "MZ", Namibia: "NA", Netherlands: "NL", "New Zealand": "NZ",
    Nicaragua: "NI", Niger: "NE", Nigeria: "NG", "North Korea": "KP",
    "North Macedonia": "MK", Norway: "NO", Oman: "OM", Palestine: "PS", Panama: "PA",
    Paraguay: "PY", Peru: "PE", Poland: "PL", Portugal: "PT", Qatar: "QA", Romania: "RO",
    Russia: "RU", "Saudi Arabia": "SA", Senegal: "SN", Serbia: "RS", Slovakia: "SK",
    Slovenia: "SI", "South Africa": "ZA", "South Korea": "KR", "Korea Republic": "KR",
    Spain: "ES", Sudan: "SD", Suriname: "SR", Sweden: "SE", Switzerland: "CH",
    Tanzania: "TZ", Thailand: "TH", Togo: "TG", "Trinidad and Tobago": "TT",
    Tunisia: "TN", Turkey: "TR", Turkiye: "TR", Uganda: "UG", Ukraine: "UA",
    "United Arab Emirates": "AE", UAE: "AE", Uruguay: "UY", USA: "US",
    "United States": "US", Uzbekistan: "UZ", Venezuela: "VE", Vietnam: "VN",
    Zambia: "ZM", Zimbabwe: "ZW", Algeria: "DZ", Angola: "AO", Bahrain: "BH",
    Benin: "BJ", "Burkina Faso": "BF",
  };

  const MAP = {};
  for (const k in A2) MAP[norm(k)] = emoji(A2[k]);
  MAP[norm("England")] = subdiv("gbeng");
  MAP[norm("Scotland")] = subdiv("gbsct");
  MAP[norm("Wales")] = subdiv("gbwls");

  WC.flag = (name) => MAP[norm(name)] || "";
})();
