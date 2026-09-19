import { measureOverlayLayout } from "./overlayLayoutManager";
jest.mock("./telemetry",()=>({trackTelemetry:jest.fn()}));
const rect=(top,height,width=360)=>({top,bottom:top+height,left:0,right:width,width,height,x:0,y:top,toJSON:()=>({})});
describe("overlay layout manager",()=>{
 beforeEach(()=>{document.body.innerHTML="";document.documentElement.style.cssText="";window.matchMedia=jest.fn().mockReturnValue({matches:true});});
 test("stacks cart above bottom nav and event editor actions",()=>{
  document.body.innerHTML='<nav class="cut-mobile-bottom-nav"></nav><div class="cev2-mobile-actions"></div><button class="cut-persistent-cart__bar"></button>';
  document.querySelector(".cut-mobile-bottom-nav").getBoundingClientRect=()=>rect(730,70);
  document.querySelector(".cev2-mobile-actions").getBoundingClientRect=()=>rect(670,60);
  document.querySelector(".cut-persistent-cart__bar").getBoundingClientRect=()=>rect(586,72);
  const out=measureOverlayLayout();
  expect(document.documentElement.style.getPropertyValue("--cut-runtime-cart-bottom")).toBe("142px");
  expect(document.documentElement.style.getPropertyValue("--cut-runtime-safe-bottom")).toBe("226px");
  expect(out.collisions).toEqual([]);
 });
 test("reports forbidden overlap",()=>{
  document.body.innerHTML='<button class="cut-whatsapp-fab"></button><button title="Compartilhar este evento"></button>';
  [...document.querySelectorAll("button")].forEach(el=>el.getBoundingClientRect=()=>rect(600,56,56));
  const out=measureOverlayLayout();expect(out.collisions).toContain("share:whatsapp");
 });
});
