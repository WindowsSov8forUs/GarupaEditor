// RHYTHM_C_SLICE_BEGIN	rva=0x3304d24	target=0x3304d24=InGameOneFrameJudgementController.GetUsableOneFrameData	owner=InGameOneFrameJudgementController	method=GetUsableOneFrameData	domain=live
// target: 0x3304d24=InGameOneFrameJudgementController.GetUsableOneFrameData
// display-name: InGameOneFrameJudgementController.GetUsableOneFrameData
// function: InGameOneFrameJudgementController.GetUsableOneFrameData
// entry: 03404d24


long InGameOneFrameJudgementController_GetUsableOneFrameData(long param_1)

{
  undefined *puVar1;
  long lVar2;
  int iVar3;
  undefined8 *unaff_x21;
  undefined8 *puVar4;
  long *unaff_x22;
  long *plVar5;

  if ((bRam0000000007352b85 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d8bdf0);
    func_0x02f10210(PTR_DAT_06d9ec80);
    func_0x02f10210(PTR_DAT_06d9ec88);
    func_0x02f10210(PTR_DAT_06d9f060);
    bRam0000000007352b85 = 1;
  }
  puVar4 = (undefined8 *)PTR_DAT_06d9f060;
  puVar1 = PTR_DAT_06d9ec88;
  plVar5 = (long *)PTR_DAT_06d8bdf0;
  lVar2 = *(long *)(param_1 + 0x60);
  if (lVar2 != 0) {
    iVar3 = 0;
    do {
      if (*(int *)(lVar2 + 0x18) <= iVar3) goto LAB_03404dd0;
      lVar2 = func_0x05868734(lVar2,iVar3,*(undefined8 *)puVar1);
      unaff_x21 = puVar4;
      unaff_x22 = plVar5;
      if (lVar2 == 0) break;
      if (*(char *)(lVar2 + 0x10) == '\0') {
        return lVar2;
      }
      lVar2 = *(long *)(param_1 + 0x60);
      iVar3 = iVar3 + 1;
    } while (lVar2 != 0);
  }
  plVar5 = unaff_x22;
  puVar4 = unaff_x21;
  func_0x02f1049c();
LAB_03404dd0:
  if (*(int *)(*plVar5 + 0xe0) == 0) {
    func_0x02f10384();
  }
  func_0x03bb6294(*puVar4,0,0);
  return 0;
}
// RHYTHM_C_SLICE_END	rva=0x3304d24
