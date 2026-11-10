import { MapChart, ScatterChart } from 'echarts/charts'
import { GeoComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([MapChart, ScatterChart, GeoComponent, TooltipComponent, CanvasRenderer])
