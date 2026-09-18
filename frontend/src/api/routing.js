import client from './client'

export async function geocodeAddress(address, lat = null, lng = null) {
  const params = { q: address }
  if (lat != null && lng != null) {
    params.lat = lat
    params.lng = lng
  }
  const { data } = await client.get('/routing/geocode', { params })
  return data
}

export async function getRoute(startLat, startLng, endLat, endLng, profile = 'driving') {
  const { data } = await client.get('/routing/route', {
    params: {
      start_lat: startLat,
      start_lng: startLng,
      end_lat: endLat,
      end_lng: endLng,
      profile
    }
  })
  return data
}

export async function getNearbyPlaces(lat, lng, radius = 5000, category = 'hospital') {
  const { data } = await client.get('/routing/nearby', {
    params: {
      lat,
      lng,
      radius,
      category
    }
  })
  return data
}
