import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import { FRIDAY_STOPS } from "./plan-data";

export const KYOTO_CENTER = [135.775, 34.999] as const;

export interface PlaceProperties {
  category: string;
  id: string;
  marker?: string;
  image?: string | undefined;
  name: string;
  synthetic: boolean;
}

export interface MapGeometryProperties {
  id: string;
  kind: "line" | "area";
  name: string;
}

export type MapGeometryCollection = FeatureCollection<LineString | Polygon, MapGeometryProperties>;

export type PlaceFeature = Feature<Point, PlaceProperties>;
export type PlaceCollection = FeatureCollection<Point, PlaceProperties>;

interface PlaceDefinition {
  category: string;
  coordinates: readonly [number, number];
  id: string;
  name: string;
}

const SAMPLE_PLACES: readonly PlaceDefinition[] = [
  {
    category: "Temple",
    coordinates: [135.785, 34.9949],
    id: "kiyomizu",
    name: "Kiyomizu-dera",
  },
  {
    category: "Coffee",
    coordinates: [135.7808, 34.9985],
    id: "arabica",
    name: "% Arabica Higashiyama",
  },
  {
    category: "Market",
    coordinates: [135.7649, 35.005],
    id: "nishiki",
    name: "Nishiki Market",
  },
  {
    category: "Shrine",
    coordinates: [135.7727, 34.9671],
    id: "fushimi-inari-senbon-torii",
    name: "Fushimi Inari Taisha Senbon Torii Observation Path",
  },
  {
    category: "Garden",
    coordinates: [135.6713, 35.0094],
    id: "arashiyama-bamboo-grove-north-entrance",
    name: "Arashiyama Bamboo Grove North Entrance Walking Route",
  },
  {
    category: "Temple",
    coordinates: [135.7292, 35.0394],
    id: "kinkakuji-golden-pavilion-garden",
    name: "Kinkaku-ji Golden Pavilion Garden Viewing Terrace",
  },
  {
    category: "Walk",
    coordinates: [135.7948, 35.0268],
    id: "philosophers-path-canal-promenade",
    name: "Philosopher's Path Canal-side Cherry Tree Promenade",
  },
  {
    category: "Landmark",
    coordinates: [135.7902, 35.0092],
    id: "keage-incline-historic-railway",
    name: "Keage Incline Historic Railway and Slope Viewpoint",
  },
  {
    category: "Shrine",
    coordinates: [135.7785, 35.0037],
    id: "yasaka-shrine-lantern-courtyard",
    name: "Yasaka Shrine Main Gate and Evening Lantern Courtyard",
  },
  {
    category: "District",
    coordinates: [135.7753, 35.0063],
    id: "gion-shirakawa-machiya-riverside",
    name: "Gion Shirakawa Traditional Machiya Riverside District",
  },
  {
    category: "Temple",
    coordinates: [135.7935, 35.0117],
    id: "nanzenji-sanmon-hojo-garden",
    name: "Nanzen-ji Temple Sanmon Gate and Hojo Garden",
  },
  {
    category: "Garden",
    coordinates: [135.7621, 35.0254],
    id: "kyoto-imperial-palace-sento-garden",
    name: "Kyoto Imperial Palace Sento Garden Southern Entrance",
  },
  {
    category: "Temple",
    coordinates: [135.773, 34.9769],
    id: "tofukuji-tsutenkyo-maple-corridor",
    name: "Tofuku-ji Tsutenkyo Bridge Maple Viewing Corridor",
  },
];

function toFeature(place: PlaceDefinition, index: number): PlaceFeature {
  return {
    type: "Feature",
    id: place.id,
    geometry: {
      type: "Point",
      coordinates: [place.coordinates[0], place.coordinates[1]],
    },
    properties: {
      category: FRIDAY_STOPS.find((stop) => stop.id === place.id)?.category ?? "place",
      image: FRIDAY_STOPS.find((stop) => stop.id === place.id)?.image,
      id: place.id,
      marker: `place-${index + 1}`,
      name: place.name,
      synthetic: false,
    },
  };
}

export function createSamplePlaces(): PlaceCollection {
  return {
    type: "FeatureCollection",
    features: SAMPLE_PLACES.map(toFeature),
  };
}

export function createEmptyPlaces(): PlaceCollection {
  return { type: "FeatureCollection", features: [] };
}

export function createStressPlaces(count = 1_200): PlaceCollection {
  let seed = 2_026_11_13;

  function nextValue(): number {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;

    return seed / 4_294_967_296;
  }

  const features = Array.from({ length: count }, (_, index): PlaceFeature => {
    const longitude = KYOTO_CENTER[0] + (nextValue() - 0.5) * 0.12;
    const latitude = KYOTO_CENTER[1] + (nextValue() - 0.5) * 0.09;
    const id = `synthetic-${index + 1}`;

    return {
      type: "Feature",
      id,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        category: "Synthetic fixture",
        id,
        name: `Synthetic point ${index + 1}`,
        synthetic: true,
      },
    };
  });

  return { type: "FeatureCollection", features };
}

export function createOrderedPlaces(ids: readonly string[]): PlaceCollection {
  const samples = createSamplePlaces();

  return {
    type: "FeatureCollection",
    features: ids.flatMap((id, index) => {
      const place = samples.features.find((feature) => feature.properties.id === id);

      return place === undefined
        ? []
        : [{ ...place, properties: { ...place.properties, marker: `place-${index + 1}` } }];
    }),
  };
}
