"""
KML parsing utilities.
Converts KML bytes → Shapely geometry → WKT (for PostGIS insertion) + GeoJSON dict.
"""
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, mapping
from shapely import wkt as shapely_wkt
from typing import Optional


KML_NS = "http://www.opengis.net/kml/2.2"


def _parse_coordinates(coord_text: str) -> list[tuple[float, float]]:
    """Parse KML coordinate string into list of (lon, lat) tuples."""
    coords = []
    for token in coord_text.strip().split():
        parts = token.split(",")
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
            coords.append((lon, lat))
    return coords


def extract_polygon_from_kml(kml_bytes: bytes) -> Optional[dict]:
    """
    Extract the first Polygon from a KML file.

    Returns a dict with:
        - wkt: WKT string suitable for PostGIS
        - geojson: GeoJSON-compatible dict
        - centroid: (lat, lon) tuple
    Or None if no polygon found.
    """
    try:
        root = ET.fromstring(kml_bytes)
    except ET.ParseError as e:
        raise ValueError(f"KML parse error: {e}")

    # Search for Polygon elements anywhere in the document
    # Support both namespaced and non-namespaced KML
    polygon_el = None
    for ns in [KML_NS, ""]:
        tag = f"{{{ns}}}Polygon" if ns else "Polygon"
        polygon_el = root.find(f".//{tag}")
        if polygon_el is not None:
            break

    if polygon_el is None:
        raise ValueError("No Polygon element found in KML file.")

    # Extract outer ring coordinates
    outer_coords = None
    for ns in [KML_NS, ""]:
        outer_tag = f"{{{ns}}}outerBoundaryIs" if ns else "outerBoundaryIs"
        ring_tag = f"{{{ns}}}LinearRing" if ns else "LinearRing"
        coord_tag = f"{{{ns}}}coordinates" if ns else "coordinates"

        outer = polygon_el.find(f".//{outer_tag}/{ring_tag}/{coord_tag}")
        if outer is not None and outer.text:
            outer_coords = _parse_coordinates(outer.text)
            break

    if not outer_coords or len(outer_coords) < 3:
        raise ValueError("Could not extract valid outer ring coordinates from KML.")

    # Build Shapely polygon
    poly = Polygon(outer_coords)
    if not poly.is_valid:
        poly = poly.buffer(0)  # attempt to fix invalid geometry

    centroid = poly.centroid
    geojson = mapping(poly)

    return {
        "wkt": poly.wkt,
        "geojson": geojson,
        "centroid_lat": centroid.y,
        "centroid_lon": centroid.x,
    }
