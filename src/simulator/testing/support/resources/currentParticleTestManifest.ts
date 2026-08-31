import type {
  ParticleCurrentResourceManifest,
  ParticleResourceAllowlistEntry,
} from "../../../backends/particleContracts";

const resources: readonly ParticleResourceAllowlistEntry[] = Object.freeze([
  Object.freeze({
    logicalAssetId: "particle/profile/current-portable-v1",
    byteLength: 1529609,
    sha256: "2A7FDAB9AEC96F0262F92557047933F19A93EBDC3FAF0345CA4768888E43EA29",
    mime: "application/json",
    width: null,
    height: null,
  }),
  Object.freeze({
    logicalAssetId: "particle/textures/current-portable-v1",
    byteLength: 3778,
    sha256: "49D8B99F4F192B038A55A2320E0B5E3C5330369744D792FCAB3795BD918811DB",
    mime: "application/json",
    width: null,
    height: null,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:directional:Default-ParticleSystem",
    byteLength: 2024,
    sha256: "ADB7DDF12ABDBEE0C3CF5B764D928A9D716B35662502A5456DCD63F8D1A8BDA9",
    mime: "image/png",
    width: 64,
    height: 64,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:directional:tex_parSet_1",
    byteLength: 202371,
    sha256: "89E7956A371483077B947D7F0D340AD0F7B39F584CB3BE6FBF78246313A06814",
    mime: "image/png",
    width: 1024,
    height: 1024,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:ordinary:Default-Particle",
    byteLength: 4116,
    sha256: "DA6E91E00F401C352900D3FAF2151BF8FA90C9D1F731C6039C7453135FEB0DC2",
    mime: "image/png",
    width: 64,
    height: 64,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:ordinary:Tex_parSet_1",
    byteLength: 236417,
    sha256: "A6F33F5B074D4900FB5DE868D1388A71F2C6DFF06E266A7C9BC8298B7F2129F9",
    mime: "image/png",
    width: 1024,
    height: 1024,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:ordinary:Tex_parSet_2",
    byteLength: 222637,
    sha256: "47B252C8673167E804B7BF0D9202F1DD8D46BBA99F203DDFBD6D118C8A36A742",
    mime: "image/png",
    width: 1024,
    height: 1024,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:ordinary:effect_circle",
    byteLength: 40235,
    sha256: "D8AB0762BC5841BDB1917B0C4744BE2F6252F2A5DACD1FDB96C12F8BC5B61EE9",
    mime: "image/png",
    width: 256,
    height: 256,
  }),
  Object.freeze({
    logicalAssetId: "particle-texture:ordinary:light",
    byteLength: 13393,
    sha256: "DD4AE4DB60300E9404B6E27B543B44F8927E18A20609E7FA91B3E458E8DF68D2",
    mime: "image/png",
    width: 128,
    height: 128,
  }),
]);

export const CURRENT_PARTICLE_RESOURCE_MANIFEST: ParticleCurrentResourceManifest = Object.freeze({
  schemaVersion: 1,
  profileAssetId: "particle/profile/current-portable-v1",
  textureManifestAssetId: "particle/textures/current-portable-v1",
  resources,
});
