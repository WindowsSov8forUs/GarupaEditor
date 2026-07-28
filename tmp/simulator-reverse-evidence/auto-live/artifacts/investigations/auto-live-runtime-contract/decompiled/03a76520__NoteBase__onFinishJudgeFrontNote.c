// RHYTHM_C_SLICE_BEGIN	rva=0x3a76520	target=0x3a76520=NoteBase.onFinishJudgeFrontNote	owner=NoteBase	method=onFinishJudgeFrontNote	domain=note
// target: 0x3a76520=NoteBase.onFinishJudgeFrontNote
// display-name: NoteBase.onFinishJudgeFrontNote
// function: NoteBase.onFinishJudgeFrontNote
// entry: 03b76520


void NoteBase_onFinishJudgeFrontNote
               (long param_1,uint param_2,undefined8 param_3,undefined8 param_4,byte param_5)

{
  ulong *puVar1;
  uint uVar2;
  int iVar3;
  char cVar4;
  bool bVar5;
  undefined *puVar6;
  undefined *puVar7;
  undefined *puVar8;
  undefined *puVar9;
  undefined *puVar10;
  int iVar11;
  uint uVar12;
  long *plVar13;
  undefined8 uVar14;
  ulong uVar15;
  undefined8 uVar16;
  undefined4 uVar17;
  long lVar18;
  undefined4 uVar19;
  undefined8 *puVar20;
  long lVar21;
  long lVar22;
  float fVar23;
  undefined1 auVar24 [12];

  if (*(char *)(param_1 + 0x54) == '\0') {
    return;
  }
  lVar21 = *(long *)(param_1 + 0x158);
  if (lVar21 == 0) {
    func_0x02f1049c();
    return;
  }
  lVar18 = *(long *)(param_1 + 0x150);
  uVar19 = 0;
  if ((bRam0000000007352aed & 1) == 0) {
    uVar19 = 0;
    func_0x02f10210(PTR_DAT_06d8e9c0);
    func_0x02f10210(PTR_DAT_06d938d8);
    func_0x02f10210(PTR_DAT_06d89f98);
    bRam0000000007352aed = 1;
  }
  if (param_2 == 0xffffffff) {
    return;
  }
  if (((*(long *)(lVar21 + 0x70) != 0) &&
      (func_0x05a13684(*(long *)(lVar21 + 0x70),0,0), puVar6 = PTR_DAT_06d8e9c0, lVar18 != 0)) &&
     (*(long *)(lVar21 + 0x70) != 0)) {
    func_0x05a13fd0(*(long *)(lVar21 + 0x70),*(undefined8 *)(lVar18 + 0x50),0);
    lVar18 = *(long *)puVar6;
    lVar22 = *(long *)(lVar21 + 0x70);
    if (*(int *)(lVar18 + 0xe0) == 0) {
      func_0x02f10384();
      lVar18 = *(long *)puVar6;
    }
    lVar18 = **(long **)(lVar18 + 0xb8);
    if (lVar18 != 0) {
      if (*(uint *)(lVar18 + 0x18) <= param_2) goto LAB_033f4d38;
      if (lVar22 != 0) {
        func_0x05a13fd0(lVar22,*(undefined8 *)(lVar18 + (long)(int)param_2 * 8 + 0x20),0);
        plVar13 = *(long **)(lVar21 + 0x70);
        if (plVar13 != (long *)0x0) {
          uVar14 = (**(code **)(*plVar13 + 0x168))(plVar13,*(undefined8 *)(*plVar13 + 0x170));
          if (*(long *)(lVar21 + 0x20) != 0) {
            uVar15 = func_0x0522bfe4(*(long *)(lVar21 + 0x20),uVar14,*(undefined8 *)PTR_DAT_06d938d8
                                    );
            if ((uVar15 & 1) == 0) {
              return;
            }
            if (*(long *)(lVar21 + 0x20) != 0) {
              uVar17 = (undefined4)*(undefined8 *)PTR_DAT_06d89f98;
              iVar11 = func_0x0522bd70(*(long *)(lVar21 + 0x20),uVar14);
              *(int *)(lVar21 + 0x54) = *(int *)(lVar21 + 0x54) + iVar11;
              if (*(long *)(lVar21 + 0x38) != 0) {
                uVar12 = func_0x03402c54(*(long *)(lVar21 + 0x38),0);
                iVar3 = *(int *)(lVar21 + 0x54);
                if (cRam0000000007350953 == '\0') {
                  func_0x02f10210(PTR_DAT_06d84488);
                  cRam0000000007350953 = '\x01';
                }
                fVar23 = (float)(0x50 - iVar3) / (float)iVar11;
                if (*(int *)(*(long *)PTR_DAT_06d84488 + 0xe0) == 0) {
                  func_0x02f10384();
                }
                lVar18 = *(long *)(lVar21 + 0x78);
                uVar2 = 0x80000000;
                if ((float)(int)fVar23 != INFINITY) {
                  uVar2 = (int)fVar23;
                }
                if (lVar18 != 0) {
                  if (*(uint *)(lVar18 + 0x18) <= uVar12) goto LAB_033f4e5c;
                  lVar21 = *(long *)(lVar21 + 0x28);
                  if (lVar21 != 0) {
                    lVar22 = *(long *)(lVar21 + 0x20);
                    *(undefined4 *)(lVar21 + 0x14) =
                         *(undefined4 *)(lVar18 + (long)(int)uVar12 * 4 + 0x20);
                    *(uint *)(lVar21 + 0x18) = uVar2 & ((int)uVar2 >> 0x1f ^ 0xffffffffU);
                    *(uint *)(lVar21 + 0x10) = uVar12;
                    *(undefined1 *)(lVar21 + 0x1c) = 1;
                    if (lVar22 == 0) {
                      return;
                    }
                    /* WARNING: Could not recover jumptable at 0x033f4e40. Too many branches */
                    /* WARNING: Treating indirect jump as call */
                    (**(code **)(lVar22 + 0x18))
                              (*(undefined8 *)(lVar22 + 0x40),lVar21,*(undefined8 *)(lVar22 + 0x28))
                    ;
                    return;
                  }
                }
              }
              func_0x02f1049c();
LAB_033f4e5c:
              lVar21 = func_0x02f104a4();
              puVar8 = PTR_DAT_06d9e698;
              puVar7 = PTR_DAT_06d9e690;
              puVar6 = PTR_DAT_06d82bd8;
              if ((bRam0000000007352aee & 1) == 0) {
                func_0x02f10210(PTR_DAT_06d9e6a0);
                func_0x02f10210(PTR_DAT_06d82bd8);
                func_0x02f10210(PTR_DAT_06d9e6a8);
                func_0x02f10210(PTR_DAT_06d9e698);
                func_0x02f10210(PTR_DAT_06d9e690);
                func_0x02f10210(PTR_DAT_06d9e6b0);
                func_0x02f10210(PTR_DAT_06d9e6b8);
                bRam0000000007352aee = 1;
              }
              puVar10 = PTR_DAT_06d9e6b0;
              puVar9 = PTR_DAT_06d9e6a8;
              lVar18 = func_0x066be27c(*(undefined8 *)puVar7,0);
              uVar14 = func_0x066be27c(*(undefined8 *)puVar8,0);
              if (*(int *)(*(long *)puVar6 + 0xe0) == 0) {
                func_0x02f10384(*(long *)puVar6);
              }
              func_0x066c2094(uVar14,0);
              uVar14 = func_0x04444ffc(*(undefined8 *)puVar10,*(undefined8 *)puVar9);
              puVar7 = PTR_DAT_06d9e6b8;
              puVar6 = PTR_DAT_06d9e6a0;
              if (lVar18 != 0) {
                uVar16 = func_0x066bdd60(lVar18,0);
                uVar17 = (undefined4)*(undefined8 *)puVar7;
                uVar19 = (undefined4)*(undefined8 *)puVar6;
                uVar14 = func_0x043ded18(uVar14,uVar16);
                if (*(long *)(lVar21 + 0x80) != 0) {
                  puVar20 = (undefined8 *)(*(long *)(lVar21 + 0x80) + 0x30);
                  *puVar20 = uVar14;
                  if (iRam0000000007582c30 != 0) {
                    puVar1 = (ulong *)(((ulong)puVar20 >> 0x12 & 0x7fff) * 8 + 0x73b6c08);
                    do {
                      cVar4 = '\x01';
                      bVar5 = (bool)ExclusiveMonitorPass(puVar1,0x10);
                      if (bVar5) {
                        *puVar1 = *puVar1 | 1L << ((ulong)puVar20 >> 0xc & 0x3f);
                        cVar4 = ExclusiveMonitorsStatus();
                      }
                    } while (cVar4 != '\0');
                  }
                  return;
                }
              }
              auVar24 = func_0x02f1049c();
              lVar21 = auVar24._0_8_;
              lVar18 = *(long *)(lVar21 + 0x20);
              *(int *)(lVar21 + 0x10) = auVar24._8_4_;
              *(undefined4 *)(lVar21 + 0x14) = uVar17;
              *(undefined4 *)(lVar21 + 0x18) = uVar19;
              *(byte *)(lVar21 + 0x1c) = param_5 & 1;
              if (lVar18 == 0) {
                return;
              }
                    /* WARNING: Could not recover jumptable at 0x033f4fdc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
              (**(code **)(lVar18 + 0x18))
                        (*(undefined8 *)(lVar18 + 0x40),lVar21,*(undefined8 *)(lVar18 + 0x28));
              return;
            }
          }
        }
      }
    }
  }
  func_0x02f1049c();
LAB_033f4d38:
  auVar24 = func_0x02f104a4();
  *(int *)(auVar24._0_8_ + 0x54) = *(int *)(auVar24._0_8_ + 0x54) + auVar24._8_4_;
  return;
}
// RHYTHM_C_SLICE_END	rva=0x3a76520
