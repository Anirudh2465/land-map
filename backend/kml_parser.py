"""
KML parsing utilities.
Converts KML bytes → Shapely geometry → WKT (for PostGIS insertion) + GeoJSON dict.
"""
import xml.etree.ElementTree as ET
from typing import Optional, List, Tuple
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection, mapping
from shapely.validation import make_valid
from shapely.ops import unary_union


def _parse_coordinates(coord_text: str) -> List[Tuple[float, float]]:
    """
    Parse KML coordinate string into list of (lon, lat) tuples.
    Strictly extracts 2D coordinates, ignoring altitude (Z dimension).
    """
    coords = []
    if not coord_text:
        return coords

    for token in coord_text.strip().split():
        parts = token.split(",")
        if len(parts) >= 2:
            try:
                lon, lat = float(parts[0]), float(parts[1])
                coords.append((lon, lat))
            except ValueError:
                continue
    return coords


def _extract_polygonal_components(geom) -> List[Polygon]:
    """Extract all non-empty Polygon components from a Shapely geometry."""
    if isinstance(geom, Polygon):
        return [geom] if not geom.is_empty else []
    elif isinstance(geom, MultiPolygon):
        return [p for p in geom.geoms if not p.is_empty]
    elif isinstance(geom, GeometryCollection):
        polys = []
        for g in geom.geoms:
            polys.extend(_extract_polygonal_components(g))
        return polys
    return []


def extract_polygon_from_kml(kml_bytes: bytes) -> Optional[dict]:
    """
    Extract Polygon or MultiPolygon geometries from a KML file.

    Features:
      - Uses wildcard XML namespace matching to support any KML namespace or prefix.
      - Supports multi-part geometries under <MultiGeometry> or multiple <Placemark> tags.
      - Supports interior rings (holes) via <innerBoundaryIs>.
      - Strips altitude / Z-dimension for 2D PostGIS compatibility.
      - Uses shapely.validation.make_valid to repair self-intersecting geometries.

    Returns:
      dict with:
        - "wkt": Well-Known Text string (POLYGON or MULTIPOLYGON)
        - "geojson": GeoJSON-compatible dictionary
        - "centroid_lat": float (latitude of centroid)
        - "centroid_lon": float (longitude of centroid)
        - "centroid": (lat, lon) tuple
    """
    try:
        root = ET.fromstring(kml_bytes)
    except ET.ParseError as e:
        raise ValueError(f"KML parse error: {e}")

    # Wildcard search for all Polygon elements across any namespace
    polygon_elements = root.findall(".//{*}Polygon")
    if not polygon_elements:
        raise ValueError("No Polygon element found in KML file.")

    parsed_polygons: List[Polygon] = []

    for poly_el in polygon_elements:
        # 1. Outer boundary
        outer_coord_el = poly_el.find(".//{*}outerBoundaryIs/{*}LinearRing/{*}coordinates")
        if outer_coord_el is None or not outer_coord_el.text:
            continue

        outer_coords = _parse_coordinates(outer_coord_el.text)
        if len(outer_coords) < 3:
            continue

        # 2. Inner boundaries (holes)
        inner_coords_list = []
        for inner_el in poly_el.findall(".//{*}innerBoundaryIs/{*}LinearRing/{*}coordinates"):
            if inner_el.text:
                inners = _parse_coordinates(inner_el.text)
                if len(inners) >= 3:
                    inner_coords_list.append(inners)

        # 3. Build Polygon
        poly = Polygon(shell=outer_coords, holes=inner_coords_list)

        # 4. Repair self-intersections or validity issues
        if not poly.is_valid:
            poly = make_valid(poly)

        # 5. Extract polygonal parts (ignoring degenerate lines/points)
        parsed_polygons.extend(_extract_polygonal_components(poly))

    if not parsed_polygons:
        raise ValueError("Could not extract valid polygon coordinates from KML.")

    # Combine into single or multi-polygon
    if len(parsed_polygons) == 1:
        final_geom = parsed_polygons[0]
    else:
        union_res = unary_union(parsed_polygons)
        if isinstance(union_res, (Polygon, MultiPolygon)):
            final_geom = union_res
        else:
            filtered = _extract_polygonal_components(union_res)
            if len(filtered) == 1:
                final_geom = filtered[0]
            elif len(filtered) > 1:
                final_geom = MultiPolygon(filtered)
            else:
                raise ValueError("Failed to combine KML polygons into valid geometry.")

    centroid = final_geom.centroid

    return {
        "wkt": final_geom.wkt,
        "geojson": mapping(final_geom),
        "centroid_lat": centroid.y,
        "centroid_lon": centroid.x,
        "centroid": (centroid.y, centroid.x),
    }

