/**
 * Static gazetteer: Firebase Analytics city name -> approximate coordinates +
 * Indian state. This is the fast, offline path so well-known cities never need a
 * Google Geocoding call. Cities absent here are resolved once via geocoding and
 * cached; `(not set)` is handled separately by the dashboard and never plotted.
 *
 * India-focused (KrishiDukan is an Indian agri-retail app); extend as new cities
 * appear in monthly reports.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoPlace extends LatLng {
  state: string;
  country: string;
}

function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// name -> [lat, lng, state]. Aliases (e.g. bengaluru/bangalore) are separate
// entries. Country is India for every gazetteer entry.
const RAW: Record<string, [number, number, string]> = {
  Mumbai: [19.076, 72.8777, 'Maharashtra'],
  Delhi: [28.7041, 77.1025, 'Delhi'],
  'New Delhi': [28.6139, 77.209, 'Delhi'],
  Bengaluru: [12.9716, 77.5946, 'Karnataka'],
  Bangalore: [12.9716, 77.5946, 'Karnataka'],
  Hyderabad: [17.385, 78.4867, 'Telangana'],
  Ahmedabad: [23.0225, 72.5714, 'Gujarat'],
  Chennai: [13.0827, 80.2707, 'Tamil Nadu'],
  Kolkata: [22.5726, 88.3639, 'West Bengal'],
  Surat: [21.1702, 72.8311, 'Gujarat'],
  Pune: [18.5204, 73.8567, 'Maharashtra'],
  Jaipur: [26.9124, 75.7873, 'Rajasthan'],
  Lucknow: [26.8467, 80.9462, 'Uttar Pradesh'],
  Kanpur: [26.4499, 80.3319, 'Uttar Pradesh'],
  Nagpur: [21.1458, 79.0882, 'Maharashtra'],
  Indore: [22.7196, 75.8577, 'Madhya Pradesh'],
  Thane: [19.2183, 72.9781, 'Maharashtra'],
  Bhopal: [23.2599, 77.4126, 'Madhya Pradesh'],
  Visakhapatnam: [17.6868, 83.2185, 'Andhra Pradesh'],
  'Pimpri-Chinchwad': [18.6279, 73.8009, 'Maharashtra'],
  Patna: [25.5941, 85.1376, 'Bihar'],
  Vadodara: [22.3072, 73.1812, 'Gujarat'],
  Ghaziabad: [28.6692, 77.4538, 'Uttar Pradesh'],
  Ludhiana: [30.901, 75.8573, 'Punjab'],
  Agra: [27.1767, 78.0081, 'Uttar Pradesh'],
  Nashik: [19.9975, 73.7898, 'Maharashtra'],
  Ranchi: [23.3441, 85.3096, 'Jharkhand'],
  Faridabad: [28.4089, 77.3178, 'Haryana'],
  Meerut: [28.9845, 77.7064, 'Uttar Pradesh'],
  Rajkot: [22.3039, 70.8022, 'Gujarat'],
  Varanasi: [25.3176, 82.9739, 'Uttar Pradesh'],
  Srinagar: [34.0837, 74.7973, 'Jammu and Kashmir'],
  Aurangabad: [19.8762, 75.3433, 'Maharashtra'],
  Dhanbad: [23.7957, 86.4304, 'Jharkhand'],
  Amritsar: [31.634, 74.8723, 'Punjab'],
  'Navi Mumbai': [19.033, 73.0297, 'Maharashtra'],
  Allahabad: [25.4358, 81.8463, 'Uttar Pradesh'],
  Prayagraj: [25.4358, 81.8463, 'Uttar Pradesh'],
  Howrah: [22.5958, 88.2636, 'West Bengal'],
  Gwalior: [26.2183, 78.1828, 'Madhya Pradesh'],
  Jabalpur: [23.1815, 79.9864, 'Madhya Pradesh'],
  Coimbatore: [11.0168, 76.9558, 'Tamil Nadu'],
  Vijayawada: [16.5062, 80.648, 'Andhra Pradesh'],
  Jodhpur: [26.2389, 73.0243, 'Rajasthan'],
  Madurai: [9.9252, 78.1198, 'Tamil Nadu'],
  Raipur: [21.2514, 81.6296, 'Chhattisgarh'],
  Kota: [25.2138, 75.8648, 'Rajasthan'],
  Guwahati: [26.1445, 91.7362, 'Assam'],
  Chandigarh: [30.7333, 76.7794, 'Chandigarh'],
  Solapur: [17.6599, 75.9064, 'Maharashtra'],
  Hubli: [15.3647, 75.124, 'Karnataka'],
  'Hubli-Dharwad': [15.3647, 75.124, 'Karnataka'],
  Mysuru: [12.2958, 76.6394, 'Karnataka'],
  Mysore: [12.2958, 76.6394, 'Karnataka'],
  Tiruchirappalli: [10.7905, 78.7047, 'Tamil Nadu'],
  Bareilly: [28.367, 79.4304, 'Uttar Pradesh'],
  Aligarh: [27.8974, 78.088, 'Uttar Pradesh'],
  Tiruppur: [11.1085, 77.3411, 'Tamil Nadu'],
  Gurgaon: [28.4595, 77.0266, 'Haryana'],
  Gurugram: [28.4595, 77.0266, 'Haryana'],
  Moradabad: [28.8386, 78.7733, 'Uttar Pradesh'],
  Jalandhar: [31.326, 75.5762, 'Punjab'],
  Bhubaneswar: [20.2961, 85.8245, 'Odisha'],
  Salem: [11.6643, 78.146, 'Tamil Nadu'],
  Warangal: [17.9689, 79.5941, 'Telangana'],
  Guntur: [16.3067, 80.4365, 'Andhra Pradesh'],
  Bhiwandi: [19.2813, 73.0483, 'Maharashtra'],
  Saharanpur: [29.968, 77.5552, 'Uttar Pradesh'],
  Gorakhpur: [26.7606, 83.3732, 'Uttar Pradesh'],
  Bikaner: [28.0229, 73.3119, 'Rajasthan'],
  Amravati: [20.9374, 77.7796, 'Maharashtra'],
  Noida: [28.5355, 77.391, 'Uttar Pradesh'],
  Jamshedpur: [22.8046, 86.2029, 'Jharkhand'],
  Bhilai: [21.1938, 81.3509, 'Chhattisgarh'],
  Cuttack: [20.4625, 85.8828, 'Odisha'],
  Firozabad: [27.1591, 78.3958, 'Uttar Pradesh'],
  Kochi: [9.9312, 76.2673, 'Kerala'],
  Nellore: [14.4426, 79.9865, 'Andhra Pradesh'],
  Bhavnagar: [21.7645, 72.1519, 'Gujarat'],
  Dehradun: [30.3165, 78.0322, 'Uttarakhand'],
  Durgapur: [23.5204, 87.3119, 'West Bengal'],
  Asansol: [23.6739, 86.9524, 'West Bengal'],
  Rourkela: [22.2604, 84.8536, 'Odisha'],
  Nanded: [19.1383, 77.321, 'Maharashtra'],
  Kolhapur: [16.705, 74.2433, 'Maharashtra'],
  Ajmer: [26.4499, 74.6399, 'Rajasthan'],
  Akola: [20.7059, 77.0219, 'Maharashtra'],
  Gulbarga: [17.3297, 76.8343, 'Karnataka'],
  Jamnagar: [22.4707, 70.0577, 'Gujarat'],
  Ujjain: [23.1765, 75.7885, 'Madhya Pradesh'],
  Loni: [28.7515, 77.2885, 'Uttar Pradesh'],
  Siliguri: [26.7271, 88.3953, 'West Bengal'],
  Jhansi: [25.4484, 78.5685, 'Uttar Pradesh'],
  Ulhasnagar: [19.2215, 73.1645, 'Maharashtra'],
  Jammu: [32.7266, 74.857, 'Jammu and Kashmir'],
  Sangli: [16.8524, 74.5815, 'Maharashtra'],
  Mangalore: [12.9141, 74.856, 'Karnataka'],
  Mangaluru: [12.9141, 74.856, 'Karnataka'],
  Erode: [11.341, 77.7172, 'Tamil Nadu'],
  Belgaum: [15.8497, 74.4977, 'Karnataka'],
  Belagavi: [15.8497, 74.4977, 'Karnataka'],
  Kurnool: [15.8281, 78.0373, 'Andhra Pradesh'],
  Ambattur: [13.1143, 80.1548, 'Tamil Nadu'],
  Rajahmundry: [17.0005, 81.804, 'Andhra Pradesh'],
  Tirunelveli: [8.7139, 77.7567, 'Tamil Nadu'],
  Malegaon: [20.5579, 74.5287, 'Maharashtra'],
  Gaya: [24.7955, 85.0002, 'Bihar'],
  Udaipur: [24.5854, 73.7125, 'Rajasthan'],
  Maheshtala: [22.4983, 88.2529, 'West Bengal'],
  Davanagere: [14.4644, 75.9218, 'Karnataka'],
  Kozhikode: [11.2588, 75.7804, 'Kerala'],
  Thiruvananthapuram: [8.5241, 76.9366, 'Kerala'],
  Trivandrum: [8.5241, 76.9366, 'Kerala'],
  Thrissur: [10.5276, 76.2144, 'Kerala'],
  Panaji: [15.4909, 73.8278, 'Goa'],
  Shimla: [31.1048, 77.1734, 'Himachal Pradesh'],
  Panipat: [29.3909, 76.9635, 'Haryana'],
  Karnal: [29.6857, 76.9905, 'Haryana'],
  Hisar: [29.1492, 75.7217, 'Haryana'],
  Rohtak: [28.8955, 76.6066, 'Haryana'],
  Ambala: [30.3782, 76.7767, 'Haryana'],
  Patiala: [30.3398, 76.3869, 'Punjab'],
  Bathinda: [30.211, 74.9455, 'Punjab'],
  Satara: [17.6805, 74.0183, 'Maharashtra'],
  Latur: [18.4088, 76.5604, 'Maharashtra'],
  Ahmednagar: [19.0948, 74.748, 'Maharashtra'],
  Jalgaon: [21.0077, 75.5626, 'Maharashtra'],
  Nizamabad: [18.6725, 78.0941, 'Telangana'],
  Karimnagar: [18.4386, 79.1288, 'Telangana'],
  Anantapur: [14.6819, 77.6006, 'Andhra Pradesh'],
  Kadapa: [14.4673, 78.8242, 'Andhra Pradesh'],
  Tirupati: [13.6288, 79.4192, 'Andhra Pradesh'],
  Vellore: [12.9165, 79.1325, 'Tamil Nadu'],
  Thoothukudi: [8.7642, 78.1348, 'Tamil Nadu'],
  Dindigul: [10.3624, 77.9695, 'Tamil Nadu'],
  Shimoga: [13.9299, 75.5681, 'Karnataka'],
  Tumkur: [13.3379, 77.1173, 'Karnataka'],
  Bellary: [15.1394, 76.9214, 'Karnataka'],
};

const CITY_COORDS: Record<string, GeoPlace> = {};
for (const [name, [lat, lng, state]] of Object.entries(RAW)) {
  CITY_COORDS[key(name)] = { lat, lng, state, country: 'India' };
}

/** Coordinates + state for a city name, or null if we have no mapping for it. */
export function lookupCity(city: string): GeoPlace | null {
  return CITY_COORDS[key(city)] ?? null;
}
