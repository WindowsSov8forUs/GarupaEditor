export type {
  SimulatorBackends,
  SimulatorBackendPort,
  SimulatorBackendRequest,
  SimulatorBackendTraceEvent,
  SimulatorLifecycleBackend,
  SimulatorLifecycleBackendState,
  SimulatorFrameRateBackend,
  SimulatorManualInputGeometryBackend,
  ManualInputWorldPosition,
} from "./backends/contracts";
export {
  createRecordingSimulatorBackends,
  RecordingSimulatorBackends,
} from "./backends/recordingBackend";
export { RecordingSimulatorAudioBackend } from "./backends/recordingAudioBackend";
export { RecordingSimulatorParticleBackend } from "./backends/recordingParticleBackend";
export type {
  ParticleBackendFault,
  ParticleBackendSnapshot,
  ParticleBackendState,
  ParticleBundleProfile,
  ParticleCommand,
  ParticleCurrentResourceManifest,
  ParticleDecodedResourceMetadata,
  ParticleFailure,
  ParticleFailureCode,
  ParticleFrameBatch,
  ParticleFrameRequest,
  ParticleFrameSnapshot,
  ParticleInstanceIdentity,
  ParticleModuleProfileMap,
  ParticleModuleType,
  ParticleOperationResult,
  ParticleOwnerSnapshot,
  ParticlePortableProfile,
  ParticlePixiButtonAnchor,
  ParticlePixiSceneProfile,
  ParticleRandomStateSnapshot,
  ParticlePreparedResourcePack,
  ParticleRendererBackendSnapshot,
  ParticleRendererFrameBatch,
  ParticleRendererFrameRequest,
  ParticleProfileDefinition,
  ParticleRenderSample,
  ParticleRendererProfile,
  ParticleResourceAllowlistEntry,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
  ParticleRootId,
  ParticleSampleIdentity,
  ParticleSystemDefinition,
  ParticleTextureManifest,
  ParticleTextureManifestEntry,
  ParticleTextureProfile,
  SimulatorParticleBackend,
  SimulatorParticleRendererBackend,
} from "./backends/particleContracts";
export {
  CURRENT_PARTICLE_ROOTS,
  freezeParticleCommand,
  parseAndFreezeParticleProfile,
  parseAndFreezeParticleTextureManifest,
  particleAccepted,
  particleFloat32FromBits,
  particleFloat32ToBits,
  particleRejected,
  validateParticleCommandShape,
  validateParticleFrameRequest,
  validateParticleProfileTextureRelations,
} from "./backends/particleValidation";
export { CURRENT_PARTICLE_RESOURCE_MANIFEST } from "./backends/resources/currentParticleResourceManifest";
export { DeterministicSimulatorParticleBackend } from "./backends/particles/deterministicParticleBackend";
export { PixiParticleRendererBackend } from "./backends/pixi/pixiParticleRendererBackend";
export type { ParticlePixiTextureDecoder } from "./backends/pixi/pixiParticleRendererBackend";
export { BrowserPixiParticleTextureDecoder } from "./backends/pixi/browserPixiParticleTextureDecoder";
export {
  DeterministicParticleSimulation,
  ParticleSimulationFault,
} from "./engine/particles/particleSimulation";
export {
  particleRandomSlots,
  particleSeedRatio,
  particleXorshift128,
} from "./engine/particles/particleRandom";
export type {
  ParticleRandomStateU32,
  ParticleRandomStep,
} from "./engine/particles/particleRandom";
export {
  ImmutableLocalParticleResourceProvider,
  PortableParticleResourcePreflightAdapter,
} from "./backends/resources/localParticleResourceProvider";
export type { LocalParticleResource } from "./backends/resources/localParticleResourceProvider";
export {
  ParticleCommandOwnerTransaction,
  ParticleCommandProducer,
} from "./engine/particles/particleCommandProducer";
export type { ParticleCommandProducerSnapshot } from "./engine/particles/particleCommandProducer";
export {
  isTapKeepStartJudgeNoteType,
  isTapKeepStopJudgeNoteType,
  resolveParticleDirectionalFingerRoot,
  resolveParticleJudgementRoot,
} from "./engine/particles/particleRouteResolver";
export type {
  ParticleDirectionalFingerRouteInput,
  ParticleJudgementRouteInput,
} from "./engine/particles/particleRouteResolver";
export type {
  AudioBackendFault,
  AudioBackendSnapshot,
  AudioBackendState,
  AudioCommand,
  AudioCommandBatch,
  AudioDecodedResourceMetadata,
  AudioFailure,
  AudioFailureCode,
  AudioLoopFrames,
  AudioOperationResult,
  AudioPoolProfile,
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
  AudioResourceProfileSet,
  AudioResourceProvider,
  AudioSampleIdentity,
  AudioSemanticStateSnapshot,
  AudioVoiceSnapshot,
  SimulatorAudioBackend,
} from "./backends/audioContracts";
export {
  audioAccepted,
  audioFloat32FromBits,
  audioFloat32ToBits,
  audioRejected,
  freezeAudioCommand,
  validateAndFreezeAudioProfile,
  validateAudioCommandShape,
} from "./backends/audioValidation";
export { RecordingSimulatorRendererBackend } from "./backends/recordingRendererBackend";
export {
  RenderFidelityLabel,
} from "./backends/renderingContracts";
export type {
  RenderAnimationRole,
  RenderAtlasRow,
  RenderBackendFault,
  RenderBackendSnapshot,
  RenderBackendState,
  RenderColor,
  RenderCommand,
  RenderCommandBase,
  RenderCommandBatch,
  RenderComponentMapping,
  RenderDecodedResourceMetadata,
  RenderFidelitySelection,
  RenderFloat32,
  RenderMaterialRole,
  RenderObjectRole,
  RenderOrderingKey,
  RenderOrthographicProjectionProfile,
  RenderProjectionMode,
  RenderResourceAssetProfile,
  RenderResourcePreflightAdapter,
  RenderResourceProfile,
  RenderResourceRole,
  RenderSampleIdentity,
  RenderSceneProfile,
  RenderTextureSettings,
  RenderVector2,
  RenderVector3,
  SimulatorRendererBackend,
  SimulatorResourceProvider,
} from "./backends/renderingContracts";
export {
  createRenderFloat32,
  validateAndFreezeRenderProfile,
  validateRenderFloat32,
} from "./backends/renderingValidation";
export {
  ImmutableLocalRenderResourceProvider,
  PortableRenderResourcePreflightAdapter,
} from "./backends/resources/localResourceProvider";
export type { LocalRenderResource } from "./backends/resources/localResourceProvider";
export { sha256UpperHex } from "./backends/resources/sha256";
export { CURRENT_AUDIO_RESOURCE_PROFILE } from "./backends/resources/currentAudioResourceManifest";
export {
  ImmutableLocalAudioResourceProvider,
} from "./backends/resources/localAudioResourceProvider";
export type { LocalAudioResource } from "./backends/resources/localAudioResourceProvider";
export { DeterministicOfflineAudioBackend } from "./backends/audio/offlineAudioBackend";
export { WebAudioSimulatorBackend } from "./backends/audio/webAudioBackend";
export type {
  OfflineAudioBackend,
  OfflineAudioFadePlan,
  OfflineAudioLoopPlan,
  OfflineAudioMixRequest,
  OfflineAudioMixResult,
  OfflineAudioPcmSource,
  OfflineAudioVoicePlan,
} from "./backends/audio/offlineAudioContracts";
export {
  BrowserHabahiroBestdoriTransport,
  parseHabahiroAtlasRows,
  prepareHabahiroBestdoriPack,
} from "./backends/resources/habahiroBestdoriProvider";
export type {
  HabahiroBestdoriTransport,
  PreparedHabahiroBestdoriPack,
} from "./backends/resources/habahiroBestdoriProvider";
export {
  HABAHIRO_BESTDORI_PACK_IDENTITY,
  HABAHIRO_BESTDORI_PINNED_ASSETS,
} from "./backends/resources/habahiroBestdoriManifest";
export { PixiRendererBackend } from "./backends/pixi/pixiRendererBackend";
export type {
  PixiSceneObjectFactory,
  PixiTextureDecoder,
} from "./backends/pixi/pixiRendererBackend";
export { BrowserPixiTextureDecoder } from "./backends/pixi/browserPixiTextureDecoder";
export {
  createNoteBatchInformationList,
  MusicScoreBezierConverter,
  MusicScoreHeaderParser,
  NoteBatchInformationListFactory,
  NoteDataBMSBuilder,
} from "./engine/chart/construction";
export {
  ChartConstructionEvidence,
} from "./engine/chart/evidence";
export type {
  ChartConstructionEvidenceId,
} from "./engine/chart/evidence";
export type {
  ChartConstructionInput,
  ChartConstructionResult,
  NoteBatchInformation,
  NoteBatchInformationList,
  NoteInformation,
} from "./engine/chart/types";
export {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  VirtualLaneDirection,
} from "./engine/chart/types";
export type {
  AfterNoteTypeValue,
  ButtonTypeValue,
  FrontNoteTypeValue,
  GameNoteAdditionalTypeValue,
  GameNoteTypeValue,
  VirtualLaneDirectionValue,
} from "./engine/chart/types";
export type {
  MusicPosition,
  NoteFamily,
} from "./engine/data/noteData";
export type {
  AutoLiveJudgementData,
  OneFrameBusinessData,
  OneFrameDataHandle,
  OneFrameJudgementBatch,
  OneFrameJudgementEntry,
} from "./engine/data/oneFrameData";
export type {
  EvidenceBound,
  EvidenceId,
  EvidenceReference,
  EvidenceRequired,
  AutoLiveEvidenceId,
  FirstSliceEvidenceId,
  ManualInputEvidenceId,
  ScoreLifeStateEvidenceId,
  ResourcePixiRenderingEvidenceId,
  SimulatorResult,
  SimulatorEvidenceId,
} from "./engine/evidence";
export type { SimulatorPlayMode } from "./engine/data/inGameCalculatedData";
export {
  ScoreLifeMode,
  SkillActivateEffectType,
} from "./engine/data/scoreLifeState";
export type {
  FeverDifficulty,
  InclusiveRateRange,
  ScoreLifeModeValue,
  ScoreLifeSpecialModeProfile,
  ScoreLifeStateProfile,
  SituationSkillProfile,
  SkillActivateEffectProfile,
  SkillOnceEffectProfile,
} from "./engine/data/scoreLifeState";
export {
  FeverTimeCommand,
  FeverTimeState,
} from "./engine/managers/feverTimeManager";
export type { FeverTimeCommandName } from "./engine/managers/feverTimeManager";
export { SituationSkillPlayState } from "./engine/managers/situationSkillManager";
export {
  AudioCommandProducer,
  AudioOwnerTransaction,
  mapAudioResult,
} from "./engine/audio/audioCommandProducer";
export type { SimulatorAudioSessionInput } from "./engine/audio/audioCommandProducer";
export { countMaximumNotes } from "./engine/managers/scoreLifeStateManager";
export type {
  ScoreLifeReflectBatch,
  ScoreLifeReflectEntry,
  ScoreLifeReflectPlan,
  ScoreLifeStateSnapshot,
} from "./engine/managers/scoreLifeStateManager";
export {
  JudgeTiming,
  NoteResultType,
  getManualNoteResult,
  getManualScreenDistanceRate,
  getSecondsWithDistance,
  judgeManualNote,
} from "./engine/data/manualJudgement";
export type {
  JudgeTimingValue,
  ManualNoteJudgement,
  ManualScreenDistanceRateRequest,
  NoteResultTypeValue,
} from "./engine/data/manualJudgement";
export { ManualTouchPhase } from "./engine/data/manualInput";
export type {
  ManualInputButtonResolution,
  ManualInputFrame,
  ManualInputFrameSnapshot,
  ManualInputPosition,
  ManualInputResolutionOwnerSnapshot,
  ManualInputTouch,
  ManualInputTouchSnapshot,
  ManualTouchPhaseValue,
} from "./engine/data/manualInput";
export { copyManualInputPosition } from "./engine/data/manualInput";
export { NoteBase, NoteState } from "./engine/notes/noteBase";
export { NoteBpmChange } from "./engine/notes/noteBpmChange";
export {
  RenderCommandProducer,
  RenderOwnerTransaction,
  longAfterRenderObjectId,
  longMeshRenderObjectId,
  resolveFrontSpriteBinding,
  rootRenderObjectId,
  validateHabahiroScene,
  validateOrdinaryFixedNoteSceneInput,
} from "./engine/rendering/renderCommandProducer";
export type {
  HabahiroSceneInput,
  OrdinaryFixedNoteSceneInput,
  OrdinaryNoteTransformVisualState,
  PreparedOrdinaryNoteActivation,
  PreparedOrdinaryNoteMotion,
  RenderEngineResourceBindings,
  RenderFieldObjectPlan,
  RenderPoolIdentityPlan,
} from "./engine/rendering/renderCommandProducer";
export {
  advanceOrdinaryNoteActivationAdjustment,
  advanceOrdinaryNoteMotion,
  buildOrdinaryAdvancedNoteMesh,
  buildOrdinaryBaseNoteMesh,
  buildOrdinarySyncLine,
  getHabahiroMeshWidthRate,
  getOrdinaryNoteArrivalSeconds,
} from "./engine/rendering/ordinaryNoteGeometry";
export {
  advanceOrdinaryLongNormalChild,
  buildOrdinaryLongNormalMesh,
  createOrdinaryLongNormalChildState,
} from "./engine/rendering/ordinaryLongChildLifecycle";
export type {
  OrdinaryLongAfterPhase,
  OrdinaryLongNormalChildFrameInput,
  OrdinaryLongNormalChildState,
  OrdinaryLongNormalMeshInput,
} from "./engine/rendering/ordinaryLongChildLifecycle";
export type {
  OrdinaryBaseNoteMeshGeometry,
  OrdinaryBaseNoteMeshOwnerState,
  OrdinaryNoteActivationAdjustmentResult,
  OrdinaryNoteMeshEndpoint,
  OrdinaryNoteMotionResult,
  OrdinaryNoteMotionState,
  OrdinarySyncLineGeometry,
  OrdinarySyncLineOwnerState,
  OrdinarySyncLineTargetState,
} from "./engine/rendering/ordinaryNoteGeometry";
export {
  NoteAfterBase,
  NoteDirectionalFlick,
  NoteDirectionalFlickAfter,
  NoteFlick,
  NoteFlickAfter,
  NoteFlickBase,
  NoteFrontBase,
  NoteLong,
  NoteMultipleDirectionalFlick,
  NoteMultipleDirectionalFlickAfter,
  NoteNormal,
  NoteSingleBase,
  NoteSlide,
  NoteSlideAfter,
  NoteSlideDirectionalFlickAfter,
  NoteSlideFlickAfter,
  NoteSlideMultipleDirectionalFlickAfter,
} from "./engine/notes/noteTypes";
export { createSimulatorEngine } from "./host/createSimulatorEngine";
export type {
  SimulatorEngine,
  SimulatorEngineInput,
  SimulatorParticleSessionInput,
  SimulatorRenderingSessionInput,
  SimulatorSnapshot,
} from "./host/contracts";
