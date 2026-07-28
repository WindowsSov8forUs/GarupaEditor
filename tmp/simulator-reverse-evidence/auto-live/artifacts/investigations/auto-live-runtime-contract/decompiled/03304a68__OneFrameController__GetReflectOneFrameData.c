// RHYTHM_C_SLICE_BEGIN	rva=0x3304a68	target=0x3304a68=InGameOneFrameJudgementController.GetReflectOneFrameData	owner=InGameOneFrameJudgementController	method=GetReflectOneFrameData	domain=live
// target: 0x3304a68=InGameOneFrameJudgementController.GetReflectOneFrameData
// display-name: InGameOneFrameJudgementController.GetReflectOneFrameData
// function: InGameOneFrameJudgementController.GetReflectOneFrameData
// entry: 03404a68


void InGameOneFrameJudgementController_GetReflectOneFrameData(undefined8 *param_1,long param_2)

{
  undefined8 uVar1;
  undefined8 uVar2;
  undefined8 uVar3;
  undefined8 uVar4;

  uVar2 = *(undefined8 *)(param_2 + 0x80);
  uVar1 = *(undefined8 *)(param_2 + 0x78);
  uVar4 = *(undefined8 *)(param_2 + 0x70);
  uVar3 = *(undefined8 *)(param_2 + 0x68);
  param_1[4] = *(undefined8 *)(param_2 + 0x88);
  param_1[1] = uVar4;
  *param_1 = uVar3;
  param_1[3] = uVar2;
  param_1[2] = uVar1;
  return;
}
// RHYTHM_C_SLICE_END	rva=0x3304a68
