import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://127.0.0.1:5190/orbital-atlas/');
await p.waitForSelector('.intro .enter.ready', { timeout: 90000 });
await p.evaluate(() => { window.__atlas.finishIntro(); window.__atlas.jump('earth'); window.__atlas.select('earth'); window.__atlas.store.set({ cutaway: 'earth' }); });
await p.waitForTimeout(8000);
const info = await p.evaluate(() => {
  const v = window.__atlas.engine.bodies.view('earth');
  const u = v.mat.uniforms;
  return { cutOpen: v.cutOpen, cutTarget: v.cutTarget, uCut: u.uCut.value, angle: u.uCutAngle.value, axis: u.uCutAxis.value.toArray(), A: u.uCutA.value.toArray(), center: u.uCenter.value.toArray(), faces: v.cutFaces.map((m) => m.visible), cutaway: !!window.__atlas.engine.bodies.cutaway, matrixW: v.mesh.matrixWorld.elements.slice(12, 15) };
});
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: 'pruef-ausgabe/dbg.png' });
await b.close();
