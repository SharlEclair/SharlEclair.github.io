import { createExperience } from './core/experience.js'

// The shipped page. One look, no switcher.
//
// The whole boot sequence lives in core/experience.js so that presets.html can
// run the identical scene -- same frame loop, same panel, same airflow field --
// and differ only in which preset it starts on and whether it draws a switcher.
createExperience({
  canvas: document.querySelector('#webgl'),
  storageKey: 'f1-currents-config-v1',
})
