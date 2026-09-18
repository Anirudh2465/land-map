import httpx
from fastapi import APIRouter, HTTPException, Query
import urllib.parse

router = APIRouter(prefix="/routing", tags=["Routing and Places"])

USER_AGENT = "LPMS-App/1.0"

@router.get("/geocode")
async def geocode(
    q: str = Query(..., description="Address to geocode"),
    lat: float = None,
    lng: float = None
):
    """
    Proxy to Nominatim API to convert an address into coordinates.
    """
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}&format=json&limit=5"
    
    # If coordinates are provided, bias the search to a ~50km radius around them
    if lat is not None and lng is not None:
        left = lng - 0.5
        right = lng + 0.5
        top = lat + 0.5
        bottom = lat - 0.5
        url += f"&viewbox={left},{top},{right},{bottom}"

    async with httpx.AsyncClient(timeout=60.0) as client:
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
    Proxy to OSRM API for turn-by-turn directions.
    OSRM takes coordinates as {longitude},{latitude}
    """
    url = f"http://router.project-osrm.org/route/v1/{profile}/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson&steps=true"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, headers={"User-Agent": USER_AGENT})
        
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to reach Routing service")
            
        data = response.json()
        if data.get("code") != "Ok":
            raise HTTPException(status_code=400, detail="Could not find a valid route")
            
        return data


@router.get("/nearby")
async def get_nearby(
    lat: float, 
    lng: float, 
    radius: int = Query(5000, description="Search radius in meters"),
    category: str = Query(..., description="Category to search for (e.g., hospital, school, restaurant)")
):
    """
    Proxy to Overpass API to find nearby Points of Interest based on tags.
    """
    # Define mapping from our categories to OSM tags
    category_tags = {
        "hospital": '"amenity"="hospital"',
        "school": '"amenity"="school"',
        "restaurant": '"amenity"="restaurant"',
        "attraction": '"tourism"="attraction"',
        "atm": '"amenity"="atm"'
    }
    
    tag = category_tags.get(category.lower())
    if not tag:
        tag = f'"amenity"="{category.lower()}"' # fallback generic
        
    # Build Overpass QL query: look for nodes within radius of lat,lng
    query = f"""
    [out:json];
    (
      node[{tag}](around:{radius},{lat},{lng});
    );
    out body;
    """
    
    url = "https://overpass-api.de/api/interpreter"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT})
        
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to reach Overpass API")
            
        return response.json()
