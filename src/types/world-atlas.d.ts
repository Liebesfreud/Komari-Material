declare module 'world-atlas/countries-110m.json' {
  import type { GeometryCollection, Topology } from 'topojson-specification'

  const worldAtlas: Topology<{
    countries: GeometryCollection
    land: GeometryCollection
  }>

  export default worldAtlas
}
