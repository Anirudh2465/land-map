import httpx
from fastapi import APIRouter, HTTPException, Query
import urllib.parse
import math
from config import settings

router = APIRouter(prefix="/routing", tags=["Routing and Places"])

USER_AGENT = "LPMS-App/1.0"

@router.get("/geocode")
async def geocode(
    q: str = Query(..., description="Address to geocode"),
    lat: float = None,
    lng: float = None
):
    """
    Geocode an address into coordinates using Mapbox API (with Nominatim fallback).
    """
    if settings.MAPBOX_ACCESS_TOKEN:
        try:
            url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{urllib.parse.quote(q)}.json?access_token={settings.MAPBOX_ACCESS_TOKEN}&limit=5"
            if lat is not None and lng is not None:
                url += f"&proximity={lng},{lat}"

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers={"User-Agent": USER_AGENT})
                if response.status_code == 200:
                    data = response.json()
                    results = []
                    for feat in data.get("features", []):
                        center = feat.get("center", [0, 0])
                        results.append({
                            "display_name": feat.get("place_name", feat.get("text", "")),
                            "lat": str(center[1]),
                            "lon": str(center[0]),
                        })
                    return results
        except Exception as e:
            print(f"Mapbox geocoding error: {e}, falling back to Nominatim")

    # Fallback to Nominatim API
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}&format=json&limit=5"
    if lat is not None and lng is not None:
        left = lng - 0.5
        right = lng + 0.5
        top = lat + 0.5
        bottom = lat - 0.5
        url += f"&viewbox={left},{top},{right},{bottom}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers={"User-Agent": USER_AGENT})
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to reach Geocoding service")
        return response.json()


@router.get("/route")
async def get_route(
    start_lat: float, 
    start_lng: float, 
    end_lat: float, 
    end_lng: float,
    profile: str = Query("driving", description="Travel profile: driving, cycling, foot")
):
    """
    Turn-by-turn directions using Mapbox Directions API (with OSRM fallback).
    """
    mapbox_profile = "cycling" if profile in ["bike", "cycling"] else ("walking" if profile in ["foot", "walking"] else "driving")
    
    if settings.MAPBOX_ACCESS_TOKEN:
        try:
            url = f"https://api.mapbox.com/directions/v5/mapbox/{mapbox_profile}/{start_lng},{start_lat};{end_lng},{end_lat}?geometries=geojson&steps=true&overview=full&access_token={settings.MAPBOX_ACCESS_TOKEN}"
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(url, headers={"User-Agent": USER_AGENT})
                if response.status_code == 200:
                    data = response.json()
                    if data.get("code") == "Ok":
                        return data
        except Exception as e:
            print(f"Mapbox routing error: {e}, falling back to OSRM")

    # Fallback to public OSRM API
    osrm_profile = "bike" if profile in ["bike", "cycling"] else ("foot" if profile in ["foot", "walking"] else "driving")
    url = f"http://router.project-osrm.org/route/v1/{osrm_profile}/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson&steps=true"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers={"User-Agent": USER_AGENT})
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to reach Routing service")
        data = response.json()
        if data.get("code") != "Ok":
            raise HTTPException(status_code=400, detail="Could not find a valid route")
        return data


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


@router.get("/nearby")
async def get_nearby(
    lat: float, 
    lng: float, 
    radius: int = Query(5000, description="Search radius in meters"),
    category: str = Query(..., description="Category to search for (e.g., hospital, school, restaurant)")
):
    """
    Find nearby Points of Interest strictly within the given radius in meters.
    """
    category_tags = {
        "hospital": '"amenity"="hospital"',
        "school": '"amenity"="school"',
        "restaurant": '"amenity"="restaurant"',
        "park": '"leisure"="park"',
        "supermarket": '"shop"="supermarket"',
        "pharmacy": '"amenity"="pharmacy"',
        "bank": '"amenity"="bank"'
    }
    
    tag = category_tags.get(category.lower(), f'"amenity"="{category.lower()}"')
    query = f"""
    [out:json][timeout:15];
    (
      node[{tag}](around:{radius},{lat},{lng});
      way[{tag}](around:{radius},{lat},{lng});
    );
    out center body;
    """
    
    url = "https://overpass-api.de/api/interpreter"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT})
            if response.status_code == 200:
                data = response.json()
                valid_elements = []
                for el in data.get("elements", []):
                    p_lat = el.get("lat") or el.get("center", {}).get("lat")
                    p_lon = el.get("lon") or el.get("center", {}).get("lon")
                    if p_lat is not None and p_lon is not None:
                        dist = haversine_distance(lat, lng, p_lat, p_lon)
                        if dist <= radius:
                            el["lat"] = p_lat
                            el["lon"] = p_lon
                            el["distance"] = dist
                            valid_elements.append(el)
                valid_elements.sort(key=lambda x: x.get("distance", 0))
                return {"elements": valid_elements}
    except Exception as e:
        print(f"Overpass error: {e}, attempting Mapbox fallback")

    # Fallback to Mapbox POI search strictly bounded within radius
    if settings.MAPBOX_ACCESS_TOKEN:
        try:
            delta_lat = radius / 111320.0
            delta_lng = radius / (111320.0 * math.cos(math.radians(lat)))
            min_lng = lng - delta_lng
            min_lat = lat - delta_lat
            max_lng = lng + delta_lng
            max_lat = lat + delta_lat
            bbox_str = f"{min_lng:.6f},{min_lat:.6f},{max_lng:.6f},{max_lat:.6f}"

            mb_url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{urllib.parse.quote(category)}.json?bbox={bbox_str}&proximity={lng},{lat}&limit=10&access_token={settings.MAPBOX_ACCESS_TOKEN}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(mb_url, headers={"User-Agent": USER_AGENT})
                if res.status_code == 200:
                    mb_data = res.json()
                    valid_elements = []
                    for f in mb_data.get("features", []):
                        center = f.get("center", [0, 0])
                        p_lon, p_lat = center[0], center[1]
                        dist = haversine_distance(lat, lng, p_lat, p_lon)
                        if dist <= radius:
                            valid_elements.append({
                                "id": f.get("id"),
                                "lat": p_lat,
                                "lon": p_lon,
                                "distance": dist,
                                "tags": {
                                    "name": f.get("text", category),
                                    "addr:street": f.get("place_name", "")
                                }
                            })
                    valid_elements.sort(key=lambda x: x.get("distance", 0))
                    return {"elements": valid_elements}
        except Exception as e:
            print(f"Mapbox fallback error: {e}")

    return {"elements": []}
