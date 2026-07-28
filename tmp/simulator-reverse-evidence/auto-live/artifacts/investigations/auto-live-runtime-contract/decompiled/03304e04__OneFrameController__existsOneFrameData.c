// RHYTHM_C_SLICE_BEGIN	rva=0x3304e04	target=0x3304e04=InGameOneFrameJudgementController.existsOneFrameData	owner=InGameOneFrameJudgementController	method=existsOneFrameData	domain=live
// target: 0x3304e04=InGameOneFrameJudgementController.existsOneFrameData
// display-name: InGameOneFrameJudgementController.existsOneFrameData
// function: InGameOneFrameJudgementController.existsOneFrameData
// entry: 03404e04


bool InGameOneFrameJudgementController_existsOneFrameData(long param_1)

{
  undefined *puVar1;
  long lVar2;
  int iVar3;
  int unaff_w22;

  iVar3 = 0x7352000;
  if ((bRam0000000007352b86 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d9ec80);
    func_0x02f10210(PTR_DAT_06d9ec88);
    bRam0000000007352b86 = 1;
  }
  puVar1 = PTR_DAT_06d9ec88;
  lVar2 = *(long *)(param_1 + 0x60);
  if (lVar2 != 0) {
    iVar3 = 0;
    do {
      unaff_w22 = *(int *)(lVar2 + 0x18);
      if (unaff_w22 <= iVar3) goto LAB_03404e88;
      lVar2 = func_0x05868734(lVar2,iVar3,*(undefined8 *)puVar1);
      if (lVar2 == 0) break;
      if (*(char *)(lVar2 + 0x10) != '\0') goto LAB_03404e94;
      lVar2 = *(long *)(param_1 + 0x60);
      iVar3 = iVar3 + 1;
    } while (lVar2 != 0);
  }
  func_0x02f1049c();
LAB_03404e88:
  OneFrameTotalData_Reset(param_1 + 0x68,0);
LAB_03404e94:
  return iVar3 < unaff_w22;
}
// RHYTHM_C_SLICE_END	rva=0x3304e04
