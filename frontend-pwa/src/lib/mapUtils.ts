/** Open Google Maps directions without requesting the browser's GPS location. */
export function openGoogleMapsDirections(lat?: number, lng?: number, addressOrName?: string) {
  const destination = lat !== undefined && lng !== undefined
    ? `${lat},${lng}`
    : encodeURIComponent(addressOrName || 'Sa Pa, Lào Cai');
  const url = `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${destination}`;

  // Google Maps lets the user choose the origin, including "Your location".
  window.open(url, '_blank', 'noopener,noreferrer');
}
