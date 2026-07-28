// RHYTHM_C_SLICE_BEGIN	rva=0x3304c40	target=0x3304c40=InGameOneFrameJudgementController.InitOneFrameDataList	owner=InGameOneFrameJudgementController	method=InitOneFrameDataList	domain=live
// target: 0x3304c40=InGameOneFrameJudgementController.InitOneFrameDataList
// display-name: InGameOneFrameJudgementController.InitOneFrameDataList
// function: InGameOneFrameJudgementController.InitOneFrameDataList
// entry: 03404c40


long InGameOneFrameJudgementController_InitOneFrameDataList(long param_1)

{
  uint uVar1;
  undefined *puVar2;
  undefined8 *puVar3;
  long *plVar4;
  undefined8 uVar5;
  long lVar6;
  long lVar7;
  undefined8 *puVar8;
  long lVar9;
  int iVar10;
  long *plVar11;

  if ((bRam0000000007352b84 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d9f050);
    func_0x02f10210(PTR_DAT_06d9f058);
    bRam0000000007352b84 = 1;
  }
  puVar3 = (undefined8 *)PTR_DAT_06d9f058;
  plVar4 = (long *)PTR_DAT_06d9f050;
  iVar10 = 5;
  while( true ) {
    uVar5 = func_0x02f10498(*puVar3);
    func_0x033f386c(uVar5,0);
    lVar6 = *(long *)(param_1 + 0x60);
    if (lVar6 == 0) break;
    lVar7 = *(long *)(lVar6 + 0x10);
    lVar9 = *plVar4;
    *(int *)(lVar6 + 0x1c) = *(int *)(lVar6 + 0x1c) + 1;
    if (lVar7 == 0) break;
    uVar1 = *(uint *)(lVar6 + 0x18);
    if (uVar1 < *(uint *)(lVar7 + 0x18)) {
      *(uint *)(lVar6 + 0x18) = uVar1 + 1;
      puVar8 = (undefined8 *)(lVar7 + (long)(int)uVar1 * 8 + 0x20);
      *puVar8 = uVar5;
      lVar6 = func_0x02f101bc(puVar8,uVar5);
    }
    else {
      lVar6 = func_0x05868a04(lVar6,uVar5,
                              *(undefined8 *)(*(long *)(*(long *)(lVar9 + 0x20) + 0xc0) + 0x70));
    }
    iVar10 = iVar10 + -1;
    if (iVar10 == 0) {
      return lVar6;
    }
  }
  lVar6 = func_0x02f1049c();
  if ((bRam0000000007352b85 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d8bdf0);
    func_0x02f10210(PTR_DAT_06d9ec80);
    func_0x02f10210(PTR_DAT_06d9ec88);
    func_0x02f10210(PTR_DAT_06d9f060);
    bRam0000000007352b85 = 1;
  }
  puVar8 = (undefined8 *)PTR_DAT_06d9f060;
  puVar2 = PTR_DAT_06d9ec88;
  plVar11 = (long *)PTR_DAT_06d8bdf0;
  lVar7 = *(long *)(lVar6 + 0x60);
  if (lVar7 != 0) {
    iVar10 = 0;
    do {
      if (*(int *)(lVar7 + 0x18) <= iVar10) goto LAB_03404dd0;
      lVar7 = func_0x05868734(lVar7,iVar10,*(undefined8 *)puVar2);
      puVar3 = puVar8;
      plVar4 = plVar11;
      if (lVar7 == 0) break;
      if (*(char *)(lVar7 + 0x10) == '\0') {
        return lVar7;
      }
      lVar7 = *(long *)(lVar6 + 0x60);
      iVar10 = iVar10 + 1;
    } while (lVar7 != 0);
  }
  plVar11 = plVar4;
  puVar8 = puVar3;
  func_0x02f1049c();
LAB_03404dd0:
  if (*(int *)(*plVar11 + 0xe0) == 0) {
    func_0x02f10384();
  }
  func_0x03bb6294(*puVar8,0,0);
  return 0;
}
// RHYTHM_C_SLICE_END	rva=0x3304c40
