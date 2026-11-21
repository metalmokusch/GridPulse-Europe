// EIC bidding-zone codes cross-checked against ENTSO-E's published area list.
// Germany is represented by the combined DE-LU bidding zone.
export const ENTSOE_LIVE_COUNTRIES = Object.freeze([
  { code: 'HU', name: 'Hungary', sourceZone: '10YHU-MAVIR----U' },
  { code: 'AT', name: 'Austria', sourceZone: '10YAT-APG------L' },
  { code: 'DE', name: 'Germany (DE-LU zone)', sourceZone: '10Y1001A1001A82H' },
  { code: 'NL', name: 'Netherlands', sourceZone: '10YNL----------L' },
  { code: 'PL', name: 'Poland', sourceZone: '10YPL-AREA-----S' },
  { code: 'CZ', name: 'Czechia', sourceZone: '10YCZ-CEPS-----N' },
  { code: 'SK', name: 'Slovakia', sourceZone: '10YSK-SEPS-----K' },
  { code: 'SI', name: 'Slovenia', sourceZone: '10YSI-ELES-----O' },
  { code: 'HR', name: 'Croatia', sourceZone: '10YHR-HEP------M' },
  { code: 'RO', name: 'Romania', sourceZone: '10YRO-TEL------P' },
  { code: 'GR', name: 'Greece', sourceZone: '10YGR-HTSO-----Y' },
  { code: 'FR', name: 'France', sourceZone: '10YFR-RTE------C' },
  { code: 'BE', name: 'Belgium', sourceZone: '10YBE----------2' },
  { code: 'ES', name: 'Spain', sourceZone: '10YES-REE------0' },
  { code: 'PT', name: 'Portugal', sourceZone: '10YPT-REN------W' },
  { code: 'FI', name: 'Finland', sourceZone: '10YFI-1--------U' },
  { code: 'LT', name: 'Lithuania', sourceZone: '10YLT-1001A0008Q' },
  { code: 'LV', name: 'Latvia', sourceZone: '10YLV-1001A00074' },
  { code: 'EE', name: 'Estonia', sourceZone: '10Y1001A1001A39I' },
  { code: 'CH', name: 'Switzerland', sourceZone: '10YCH-SWISSGRIDZ' }
]);

export function getEntsoeCountry(code) {
  return ENTSOE_LIVE_COUNTRIES.find((country) => country.code === code) ?? null;
}
