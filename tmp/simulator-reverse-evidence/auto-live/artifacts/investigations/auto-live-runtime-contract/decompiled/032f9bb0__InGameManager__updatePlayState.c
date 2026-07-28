// RHYTHM_C_SLICE_BEGIN	rva=0x32f9bb0	target=0x32f9bb0=InGameManager.updatePlayState	owner=InGameManager	method=updatePlayState	domain=live
// target: 0x32f9bb0=InGameManager.updatePlayState
// display-name: InGameManager.updatePlayState
// function: InGameManager.updatePlayState
// entry: 033f9bb0


/* WARNING: Possible PIC construction at 0x033f9cbc: Changing call to branch */
/* WARNING: Possible PIC construction at 0x03413d88: Changing call to branch */
/* WARNING: Possible PIC construction at 0x034141f4: Changing call to branch */
/* WARNING: Possible PIC construction at 0x033fcbe8: Changing call to branch */
/* WARNING: Possible PIC construction at 0x033fcdf8: Changing call to branch */
/* WARNING: Possible PIC construction at 0x033fccc4: Changing call to branch */
/* WARNING: Possible PIC construction at 0x033f9e94: Changing call to branch */
/* WARNING: Possible PIC construction at 0x034143c8: Changing call to branch */
/* WARNING: Removing unreachable block (ram,0x033f9e98) */
/* WARNING: Removing unreachable block (ram,0x033f9ea0) */
/* WARNING: Removing unreachable block (ram,0x033f9eb0) */
/* WARNING: Removing unreachable block (ram,0x033f9ecc) */
/* WARNING: Removing unreachable block (ram,0x033f9ed4) */
/* WARNING: Removing unreachable block (ram,0x033fa168) */
/* WARNING: Removing unreachable block (ram,0x033f9ee0) */
/* WARNING: Removing unreachable block (ram,0x033f9eec) */
/* WARNING: Removing unreachable block (ram,0x033fa178) */
/* WARNING: Removing unreachable block (ram,0x033fccc8) */
/* WARNING: Removing unreachable block (ram,0x034141f8) */
/* WARNING: Removing unreachable block (ram,0x034143cc) */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

long * InGameManager_updatePlayState
                 (ulong param_1,ulong param_2,long *param_3,ulong param_4,long *param_5,
                 long *param_6)

{
  uint uVar1;
  undefined4 uVar2;
  byte bVar3;
  undefined *puVar4;
  ulong *puVar5;
  ulong *puVar6;
  ulong *puVar7;
  ulong *puVar8;
  undefined1 *puVar9;
  uint uVar10;
  undefined4 uVar11;
  int iVar12;
  long lVar13;
  long *plVar14;
  ulong uVar15;
  undefined8 *puVar16;
  long *plVar17;
  ulong uVar18;
  long lVar19;
  ulong uVar20;
  long *plVar21;
  ulong uVar22;
  long *extraout_x1;
  ulong extraout_x1_00;
  uint uVar23;
  long *plVar24;
  undefined8 uVar25;
  undefined8 *puVar26;
  int *piVar27;
  long *plVar28;
  long *plVar29;
  long *plVar30;
  long *unaff_x22;
  long *plVar31;
  long *plVar32;
  long *unaff_x23;
  long *plVar33;
  long *unaff_x24;
  undefined *unaff_x25;
  undefined *puVar34;
  undefined *unaff_x26;
  undefined8 unaff_x27;
  undefined8 unaff_x28;
  code *pcVar35;
  undefined1 *puVar36;
  ulong extraout_d0;
  float fVar37;
  float fVar38;
  float fVar39;
  ulong unaff_d9;
  undefined1 auVar40 [16];
  undefined1 auVar41 [16];
  undefined1 auStack_150 [12];
  int iStack_144;
  undefined8 uStack_140;
  long *plStack_138;
  ulong uStack_130;
  undefined1 auStack_128 [16];
  long *plStack_118;
  undefined8 auStack_110 [2];
  undefined *puStack_100;
  undefined *puStack_f8;
  long *plStack_f0;
  long *plStack_e8;
  long *plStack_e0;
  ulong uStack_d8;
  long *plStack_d0;
  long lStack_c8;
  ulong uStack_80;
  undefined8 uStack_78;
  undefined8 uStack_70;
  undefined8 uStack_68;
  undefined8 uStack_60;
  undefined4 auStack_58 [2];

  puVar5 = &uStack_80;
  puVar6 = &uStack_80;
  puVar7 = &uStack_80;
  puVar8 = &uStack_80;
  plVar28 = (long *)0x7352000;
  plVar29 = (long *)(param_4 & 0xffffffff);
  if ((bRam0000000007352b48 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d9e9e8);
    func_0x02f10210(PTR_DAT_06d9e9f0);
    func_0x02f10210(PTR_DAT_06d9e950);
    func_0x02f10210(PTR_DAT_06d8e9f8);
    bRam0000000007352b48 = 1;
  }
  auStack_58[0] = 0;
  if (param_3[0x1a] == 0) {
LAB_033fa1ac:
    lVar13 = func_0x02f1049c();
    if ((*(long *)(lVar13 + 0xe8) == 0) ||
       (plVar14 = *(long **)(lVar13 + 0xb0), plVar14 == (long *)0x0)) {
      lVar13 = func_0x02f1049c();
      plVar28 = (long *)PTR_DAT_06d8e9f8;
      uVar15 = 0x7352000;
      if ((bRam0000000007352b3e & 1) == 0) {
        func_0x02f10210(PTR_DAT_06d9e950);
        func_0x02f10210(PTR_DAT_06d8e9f8);
        bRam0000000007352b3e = 1;
      }
      lVar19 = func_0x04a7c258(*plVar28);
      plStack_e0 = unaff_x22;
      if (lVar19 != 0) {
        func_0x033c1c4c(lVar19,0);
        lVar19 = func_0x04a7c258(*plVar28);
        if (lVar19 != 0) {
          func_0x033c1c8c(lVar19,0);
          puVar34 = PTR_DAT_06d9e950;
          plVar29 = *(long **)(lVar13 + 0xc0);
          plVar28 = (long *)0x0;
          if (plVar29 != (long *)0x0) {
            lVar19 = *plVar29;
            uVar20 = (ulong)*(ushort *)(lVar19 + 0x12e);
            if (uVar20 != 0) {
              piVar27 = (int *)(*(long *)(lVar19 + 0xb0) + 8);
              do {
                if (*(long *)(piVar27 + -2) == *(long *)PTR_DAT_06d9e950) {
                  puVar16 = (undefined8 *)(lVar19 + (long)(*piVar27 + 0x1e) * 0x10 + 0x138);
                  goto LAB_033fca14;
                }
                uVar20 = uVar20 - 1;
                piVar27 = piVar27 + 4;
              } while (uVar20 != 0);
            }
            param_5 = (long *)0x1e;
            puVar16 = (undefined8 *)func_0x02ea9e1c(plVar29);
LAB_033fca14:
            (*(code *)*puVar16)(plVar29,puVar16[1]);
            plVar28 = *(long **)(lVar13 + 0xc0);
            plStack_e0 = (long *)puVar34;
            if (plVar28 != (long *)0x0) {
              lVar19 = *plVar28;
              uVar20 = (ulong)*(ushort *)(lVar19 + 0x12e);
              if (uVar20 != 0) {
                piVar27 = (int *)(*(long *)(lVar19 + 0xb0) + 8);
                do {
                  if (*(long *)(piVar27 + -2) == *(long *)puVar34) {
                    puVar16 = (undefined8 *)(lVar19 + (long)(*piVar27 + 0x1f) * 0x10 + 0x138);
                    goto LAB_033fca78;
                  }
                  uVar20 = uVar20 - 1;
                  piVar27 = piVar27 + 4;
                } while (uVar20 != 0);
              }
              param_5 = (long *)0x1f;
              puVar16 = (undefined8 *)func_0x02ea9e1c(plVar28);
LAB_033fca78:
              (*(code *)*puVar16)(plVar28,puVar16[1]);
              if (*(long *)(lVar13 + 0xd0) != 0) {
                plVar28 = *(long **)(lVar13 + 0xc0);
                uVar20 = func_0x034081f0(*(long *)(lVar13 + 0xd0),0);
                if (plVar28 != (long *)0x0) {
                  lVar19 = *plVar28;
                  uVar15 = uVar20 & 0xffffffff;
                  uVar20 = (ulong)*(ushort *)(lVar19 + 0x12e);
                  if (uVar20 != 0) {
                    piVar27 = (int *)(*(long *)(lVar19 + 0xb0) + 8);
                    do {
                      if (*(long *)(piVar27 + -2) == *(long *)puVar34) {
                        puVar16 = (undefined8 *)(lVar19 + (long)(*piVar27 + 0x13) * 0x10 + 0x138);
                        goto LAB_033fcaf0;
                      }
                      uVar20 = uVar20 - 1;
                      piVar27 = piVar27 + 4;
                    } while (uVar20 != 0);
                  }
                  puVar16 = (undefined8 *)func_0x02ea9e1c(plVar28,*(long *)puVar34,0x13);
LAB_033fcaf0:
                  param_6 = (long *)puVar16[1];
                  param_5 = (long *)0x4;
                  plVar29 = (long *)(*(code *)*puVar16)(plVar28,uVar15);
                  if (*(long *)(lVar13 + 0xe8) != 0) {
                    *(undefined4 *)(*(long *)(lVar13 + 0xe8) + 0x10) = 5;
                    return plVar29;
                  }
                }
              }
            }
          }
        }
      }
      auVar40 = func_0x02f1049c();
      lVar19 = auVar40._8_8_;
      uVar20 = auVar40._0_8_;
      uVar23 = (uint)param_5;
      puVar16 = auStack_110;
      auStack_110[0] = 0x33fcb28;
      plVar17 = (long *)0x7352000;
      plVar14 = (long *)((ulong)param_6 & 0xffffffff);
      plVar29 = param_6;
      uVar10 = uVar23;
      puStack_100 = unaff_x26;
      puStack_f8 = unaff_x25;
      plStack_f0 = unaff_x24;
      plStack_e8 = unaff_x23;
      uStack_d8 = uVar15;
      plStack_d0 = plVar28;
      lStack_c8 = lVar13;
      if ((bRam0000000007352b3f & 1) == 0) {
        func_0x02f10210(PTR_DAT_06d9e950);
        bRam0000000007352b3f = 1;
      }
      if (lVar19 == 0) {
LAB_033fcccc:
        uVar25 = 0x33fccd0;
        auVar41 = func_0x02f1049c();
SUB_033fccd0:
        plVar24 = auVar41._0_8_;
        puVar16 = (undefined8 *)auStack_150;
        uVar20 = (ulong)plVar29 & 0xffffffff;
        uVar15 = auVar41._8_8_ & 0xffffffff;
        plVar28 = plVar24;
        uStack_140 = uVar25;
        plStack_138 = plVar17;
        uStack_130 = (ulong)param_5 & 0xffffffff;
        plStack_118 = plVar14;
        auStack_128 = auVar40;
        if ((bRam0000000007352b50 & 1) == 0) {
          func_0x02f10210(PTR_DAT_06d8bdf0);
          func_0x02f10210(PTR_DAT_06d96d08);
          func_0x02f10210(PTR_DAT_06d85ce0);
          func_0x02f10210(PTR_DAT_06d9ebc0);
          func_0x02f10210(PTR_DAT_06d9ebc8);
          func_0x02f10210(PTR_DAT_06d9ebd0);
          func_0x02f10210(PTR_DAT_06d9ebd8);
          plVar28 = (long *)func_0x02f10210(PTR_DAT_06d9ebe0);
          bRam0000000007352b50 = 1;
        }
        switch(uVar10) {
        case 6:
        case 9:
code_r0x033fcd88:
          puVar26 = (undefined8 *)PTR_DAT_06d9ebd0;
          break;
        case 7:
        case 10:
          iVar12 = (int)plVar29;
          puVar26 = (undefined8 *)PTR_DAT_06d9ebd8;
          if ((4 < iVar12 - 3U) && (puVar26 = (undefined8 *)PTR_DAT_06d9ebe0, iVar12 != 2)) {
            if (iVar12 != 1) {
              iStack_144 = iVar12;
              uVar25 = func_0x02f1038c(*(undefined8 *)PTR_DAT_06d85ce0,&iStack_144);
              uVar20 = func_0x059ff9f0(*(undefined8 *)PTR_DAT_06d9ebc0,uVar25,0);
              if (*(int *)(*(long *)PTR_DAT_06d8bdf0 + 0xe0) == 0) {
                func_0x02f10384(*(long *)PTR_DAT_06d8bdf0);
              }
              plVar28 = (long *)func_0x03bb6294(uVar20,0,0);
            }
            goto code_r0x033fcd88;
          }
          break;
        default:
          puVar26 = (undefined8 *)PTR_DAT_06d9ebc8;
        }
        if (2 < auVar41._8_4_ - 2U) {
          return plVar28;
        }
        if (plVar24[0xd] != 0) {
          func_0x0341b634(plVar24[0xd],*puVar26,0);
          plVar28 = (long *)plVar24[0x1f];
          if (*(int *)(*(long *)PTR_DAT_06d96d08 + 0xe0) == 0) {
            func_0x02f10384();
          }
          uVar25 = 0x33fcdfc;
          plVar29 = plVar28;
          goto SUB_0341caac;
        }
        uVar25 = 0x33fce98;
        auVar41 = func_0x02f1049c(0,*puVar26);
        uVar22 = auVar41._8_8_;
        auVar40._8_8_ = uVar15;
        auVar40._0_8_ = auVar41._0_8_;
        puVar16 = (undefined8 *)auStack_150;
        plVar14 = plVar24;
      }
      else {
        if (*(int *)(lVar19 + 0x34) == 0) {
          if (*(long *)(uVar20 + 0x80) == 0) goto LAB_033fcccc;
          uVar10 = 0;
          SkillUtility_CalcJudgeContinuousResultType
                    (*(undefined8 *)(*(long *)(uVar20 + 0x80) + 0x80),0);
        }
        if (*(long *)(uVar20 + 0xa8) == 0) goto LAB_033fcccc;
        plVar29 = (long *)(ulong)*(uint *)(lVar19 + 0x34);
        uVar10 = *(uint *)(lVar19 + 0x2c);
        uVar15 = func_0x033f3a24(*(long *)(uVar20 + 0xa8),*(undefined4 *)(lVar19 + 0x48),uVar10,
                                 plVar29,plVar14);
        if ((uVar15 & 1) != 0) {
LAB_033fcbec:
          plVar28 = (long *)func_0x033f9224(uVar20);
          if (((ulong)plVar28 & 1) == 0) {
            plVar17 = *(long **)(uVar20 + 0xc0);
            if (plVar17 == (long *)0x0) goto LAB_033fcccc;
            uVar25 = *(undefined8 *)(lVar19 + 0x18);
            lVar13 = *plVar17;
            uVar10 = *(uint *)(lVar19 + 0x2c);
            uVar1 = *(uint *)(lVar19 + 0x34);
            uVar15 = (ulong)*(ushort *)(lVar13 + 0x12e);
            if (uVar15 != 0) {
              piVar27 = (int *)(*(long *)(lVar13 + 0xb0) + 8);
              do {
                if (*(long *)(piVar27 + -2) == *(long *)PTR_DAT_06d9e950) {
                  puVar16 = (undefined8 *)(lVar13 + (long)(*piVar27 + 0x16) * 0x10 + 0x138);
                  goto LAB_033fcc64;
                }
                uVar15 = uVar15 - 1;
                piVar27 = piVar27 + 4;
              } while (uVar15 != 0);
            }
            puVar16 = (undefined8 *)func_0x02ea9e1c(plVar17,*(long *)PTR_DAT_06d9e950,0x16);
LAB_033fcc64:
            plVar29 = (long *)(ulong)uVar1;
            plVar28 = (long *)(*(code *)*puVar16)(plVar17,uVar25,uVar10,plVar29,uVar23 & 1,
                                                  puVar16[1]);
          }
          lVar13 = *(long *)(uVar20 + 0xa8);
          if (lVar13 != 0) {
            uVar11 = *(undefined4 *)(lVar19 + 0x48);
            uVar2 = *(undefined4 *)(lVar19 + 0x34);
            *(undefined4 *)(lVar13 + 0x10) = *(undefined4 *)(lVar19 + 0x2c);
            *(int *)(lVar13 + 0x14) = (int)param_6;
            *(undefined4 *)(lVar13 + 0x18) = uVar11;
            *(undefined4 *)(lVar13 + 0x1c) = uVar2;
            *(undefined4 *)(lVar13 + 0x20) = 3;
            return plVar28;
          }
          goto LAB_033fcccc;
        }
        uVar15 = func_0x033f9224(uVar20);
        if ((uVar15 & 1) != 0) goto LAB_033fcbec;
        uVar10 = *(uint *)(lVar19 + 0x2c);
        if ((uVar10 < 0xb) && ((1 << (ulong)(uVar10 & 0x1f) & 0x6e8U) != 0)) {
          auVar41._8_4_ = *(undefined4 *)(lVar19 + 0x34);
          auVar41._0_8_ = uVar20;
          auVar41._12_4_ = 0;
          uVar25 = 0x33fcbec;
          plVar29 = plVar14;
          goto SUB_033fccd0;
        }
        uVar22 = (ulong)*(uint *)(lVar19 + 0x34);
        uVar25 = 0x33fccc8;
      }
      plVar29 = auVar40._0_8_;
      *(undefined8 *)((long)puVar16 + -0x20) = uVar25;
      *(ulong *)((long)puVar16 + -0x18) = uVar20;
      *(long *)((long)puVar16 + -0x10) = auVar40._8_8_;
      *(long **)((long)puVar16 + -8) = plVar14;
      plVar28 = plVar29;
      if ((bRam0000000007352b51 & 1) == 0) {
        func_0x02f10210(PTR_DAT_06d96d08);
        func_0x02f10210(PTR_DAT_06d9ebe8);
        func_0x02f10210(PTR_DAT_06d9ebf0);
        plVar28 = (long *)func_0x02f10210(PTR_DAT_06d9ebf8);
        bRam0000000007352b51 = 1;
      }
      iVar12 = (int)uVar22;
      if (iVar12 == 4) {
        lVar13 = plVar29[0xd];
        puVar26 = (undefined8 *)PTR_DAT_06d9ebf0;
      }
      else if (iVar12 == 3) {
        lVar13 = plVar29[0xd];
        puVar26 = (undefined8 *)PTR_DAT_06d9ebf8;
      }
      else {
        if (iVar12 != 2) {
          return plVar28;
        }
        lVar13 = plVar29[0xd];
        puVar26 = (undefined8 *)PTR_DAT_06d9ebe8;
      }
      if (lVar13 == 0) {
        func_0x02f1049c();
        puVar34 = PTR_DAT_06d92fd8;
        *(undefined8 *)((long)puVar16 + -0x40) = 0x33fcf88;
        *(ulong *)((long)puVar16 + -0x30) = uVar22 & 0xffffffff;
        *(long **)((long)puVar16 + -0x28) = plVar29;
        if ((bRam0000000007352b40 & 1) == 0) {
          func_0x02f10210(PTR_DAT_06d92fd8);
          bRam0000000007352b40 = 1;
        }
        if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
          func_0x02f10384();
        }
        puVar4 = PTR_DAT_06da0500;
        puVar34 = PTR_DAT_06da0368;
        *(undefined8 *)((long)puVar16 + -0x40) = *(undefined8 *)((long)puVar16 + -0x40);
        *(undefined8 *)((long)puVar16 + -0x38) = 0x7352000;
        *(undefined8 *)((long)puVar16 + -0x30) = *(undefined8 *)((long)puVar16 + -0x30);
        *(undefined8 *)((long)puVar16 + -0x28) = *(undefined8 *)((long)puVar16 + -0x28);
        *(undefined4 *)((long)puVar16 + -0x44) = 0;
        if ((bRam0000000007352d6e & 1) == 0) {
          func_0x02f10210(PTR_DAT_06da0368,0);
          func_0x02f10210(PTR_DAT_06da0500);
          bRam0000000007352d6e = 1;
        }
        uVar25 = func_0x05b955c0((undefined1 *)((long)puVar16 + -0x44),*(undefined8 *)puVar34,0);
        plVar28 = (long *)func_0x059ff9f0(*(undefined8 *)puVar4,uVar25,0);
        return plVar28;
      }
      func_0x0341b634(lVar13,*puVar26,0);
      plVar28 = (long *)plVar29[0x1f];
      if (*(int *)(*(long *)PTR_DAT_06d96d08 + 0xe0) == 0) {
        func_0x02f10384();
      }
      uVar15 = *(ulong *)((long)puVar16 + -0x10);
      plVar29 = *(long **)((long)puVar16 + -8);
      uVar25 = *(undefined8 *)((long)puVar16 + -0x20);
SUB_0341caac:
      *(undefined8 *)((long)puVar16 + -0x10) = uVar25;
      if (plVar28 == (long *)0x0) {
        plVar28 = (long *)func_0x02f1049c(0,0);
        *(ulong *)((long)puVar16 + -0x30) = param_1;
        *(undefined8 *)((long)puVar16 + -0x28) = 0x341cad4;
        *(ulong *)((long)puVar16 + -0x20) = uVar15;
        *(long **)((long)puVar16 + -0x18) = plVar29;
        iVar12 = (int)plVar28;
        if ((bRam0000000007352c55 & 1) == 0) {
          func_0x02f10210(PTR_DAT_06d8bdf0);
          func_0x02f10210(PTR_DAT_06d9fa90);
          plVar28 = (long *)func_0x02f10210(PTR_DAT_06d9fa98);
          bRam0000000007352c55 = 1;
        }
        if ((iVar12 != 0) && (iVar12 != 1)) {
          uVar25 = *(undefined8 *)PTR_DAT_06d9fa90;
          *(int *)((long)puVar16 + -0x38) = iVar12;
          *(undefined8 *)((long)puVar16 + -0x48) = uVar25;
          *(undefined8 *)((long)puVar16 + -0x40) = 0xffffffffffffffff;
          uVar25 = func_0x05bce148((undefined1 *)((long)puVar16 + -0x48),0);
          uVar25 = func_0x059fbad0(*(undefined8 *)PTR_DAT_06d9fa98,uVar25,0);
          if (*(int *)(*(long *)PTR_DAT_06d8bdf0 + 0xe0) == 0) {
            func_0x02f10384(*(long *)PTR_DAT_06d8bdf0);
          }
          plVar28 = (long *)func_0x03bb6294(uVar25,0,0);
        }
        return plVar28;
      }
      if ((char)plVar28[0x2c] == '\0') {
        return plVar28;
      }
      return (long *)0x0;
    }
    iVar12 = *(int *)(*(long *)(lVar13 + 0xe8) + 0x10);
    pcVar35 = InGameManager_UpdateClearMotionStartState;
  }
  else {
    func_0x03408404(param_3[0x1a],0);
    lVar13 = param_3[0x1a];
    if (lVar13 == 0) goto LAB_033fa1ac;
    if ((*(int *)(lVar13 + 0x10) * -0x55555555 + 0x2aaaaaaaU >> 1 |
        *(int *)(lVar13 + 0x10) * -0x80000000) < 0x2aaaaaab) {
      if (param_3[0x1f] == 0) goto LAB_033fa1ac;
      iVar12 = *(int *)(param_3[0x1f] + 0x14c);
      if (iVar12 < 0) {
        plVar28 = (long *)0x0;
        if (-iVar12 <= *(int *)((long)param_3 + 0x11c)) goto LAB_033f9de4;
        goto LAB_033f9c60;
      }
      if ((iVar12 != 0) && ((int)param_3[0x23] < iVar12)) goto LAB_033f9c5c;
LAB_033f9de4:
      uVar10 = func_0x0340831c(lVar13,0);
      plVar28 = (long *)(ulong)uVar10;
      lVar13 = func_0x04a7c258(*(undefined8 *)PTR_DAT_06d8e9f8);
      if ((lVar13 != 0) && (lVar13 = func_0x033bfeb0(lVar13,0), lVar13 != 0)) {
        auStack_58[0] = *(undefined4 *)(lVar13 + 0x40);
        lVar13 = func_0x040691dc(auStack_58,0);
        if (param_3[0x1f] != 0) {
          fVar38 = (float)*(int *)(param_3[0x1f] + 0x14c) * _UNK_01636530;
          fVar37 = (float)lVar13;
          param_2 = (ulong)(uint)fVar37;
          fVar39 = -9.223372e+18;
          if (fVar38 != INFINITY) {
            fVar39 = (float)(long)fVar38;
          }
          if ((float)(int)uVar10 <= fVar37 + _UNK_01636530 + fVar39) {
            if (fVar37 <= ((float)(int)uVar10 + _UNK_01636530) - fVar39) goto LAB_033f9c5c;
            plVar28 = (long *)0x1;
            goto LAB_033f9c60;
          }
          if ((param_3[0x1d] == 0) || (plVar14 = (long *)param_3[0x16], plVar14 == (long *)0x0))
          goto LAB_033fa1ac;
          iVar12 = *(int *)(param_3[0x1d] + 0x10);
          pcVar35 = (code *)0x33f9e98;
          goto SUB_034139a0;
        }
      }
      goto LAB_033fa1ac;
    }
LAB_033f9c5c:
    plVar28 = (long *)0x0;
LAB_033f9c60:
    plVar14 = (long *)func_0x033fdbbc(param_3);
    if (param_3[0x1f] == 0) goto LAB_033fa1ac;
    iVar12 = *(int *)(param_3[0x1f] + 0x14c);
    if ((iVar12 < 0) && (*(int *)((long)param_3 + 0x11c) < -iVar12)) {
      *(int *)((long)param_3 + 0x11c) = *(int *)((long)param_3 + 0x11c) + 1;
      return plVar14;
    }
    InGameManager_updateInGameSec(param_1,param_3);
    if ((param_4 & 1) != 0) {
      plVar14 = (long *)func_0x033fdc3c(param_3);
      if (((ulong)plVar14 & 1) == 0) {
        return plVar14;
      }
      if (param_3[0xe] != 0) {
        NoteManager_ExecUpdate(param_1,param_3[0xe],0);
        lVar13 = param_3[0x15];
        if (lVar13 != 0) {
          *(int *)(lVar13 + 0x20) = *(int *)(lVar13 + 0x20) + -1;
          if (param_3[0xb] != 0) {
            func_0x03982b5c(param_3[0xb],0);
            if (((param_3[0x1a] != 0) && (param_3[0x1d] != 0)) && (param_3[0x10] != 0)) {
              param_5 = (long *)(ulong)*(uint *)(param_3[0x1d] + 0x10);
              param_6 = (long *)0x0;
              func_0x034227c0(param_3[0x10],*(undefined4 *)(param_3[0x1a] + 0x10));
              if ((param_3[0x1a] != 0) && (param_3[0x12] != 0)) {
                param_5 = (long *)param_3[0x1f];
                FeverTimeManager_ExecUpdate(param_3[0x12],*(undefined4 *)(param_3[0x1a] + 0x10));
                if (param_3[0x1a] != 0) {
                  plVar29 = (long *)param_3[0x18];
                  uVar15 = func_0x034081f0(param_3[0x1a],0);
                  puVar34 = PTR_DAT_06d9e950;
                  if (plVar29 != (long *)0x0) {
                    lVar13 = *plVar29;
                    unaff_x22 = (long *)(uVar15 & 0xffffffff);
                    uVar15 = (ulong)*(ushort *)(lVar13 + 0x12e);
                    if (uVar15 != 0) {
                      piVar27 = (int *)(*(long *)(lVar13 + 0xb0) + 8);
                      do {
                        if (*(long *)(piVar27 + -2) == *(long *)PTR_DAT_06d9e950) {
                          puVar16 = (undefined8 *)(lVar13 + (long)(*piVar27 + 0x13) * 0x10 + 0x138);
                          goto LAB_033f9f24;
                        }
                        uVar15 = uVar15 - 1;
                        piVar27 = piVar27 + 4;
                      } while (uVar15 != 0);
                    }
                    puVar16 = (undefined8 *)func_0x02ea9e1c(plVar29,*(long *)PTR_DAT_06d9e950,0x13);
LAB_033f9f24:
                    param_6 = (long *)puVar16[1];
                    param_5 = (long *)0x5;
                    (*(code *)*puVar16)(plVar29,unaff_x22);
                    uVar15 = func_0x033f9224(param_3);
                    unaff_x26 = puVar34;
                    if ((uVar15 & 1) == 0) {
                      if ((param_3[0xe] != 0) &&
                         (lVar13 = *(long *)(param_3[0xe] + 0xe8), lVar13 != 0)) {
                        plVar29 = (long *)param_3[0xf];
                        func_0x034044d4(lVar13,0);
                        if (plVar29 != (long *)0x0) {
                          func_0x0377d908(plVar29,0);
                          goto LAB_033f9f70;
                        }
                      }
                    }
                    else {
LAB_033f9f70:
                      if (param_3[0x1a] != 0) {
                        if (param_3[0x22] == 0) {
                          uVar25 = 0;
                        }
                        else {
                          uVar25 = *(undefined8 *)(param_3[0x22] + 0x70);
                        }
                        if (param_3[0xc] != 0) {
                          param_5 = (long *)param_3[0x10];
                          param_6 = (long *)(ulong)*(uint *)(param_3[0x1a] + 0x10);
                          func_0x03406ff8(param_1,param_3[0xc],param_3[0x1f],param_5,param_6,
                                          param_3[10],uVar25,0);
                          if (param_3[0x1a] != 0) {
                            lVar13 = param_3[0xd];
                            uVar11 = func_0x0340831c(param_3[0x1a],0);
                            plVar29 = (long *)0x0;
                            if (lVar13 != 0) {
                              func_0x0341b16c(lVar13,uVar11,0);
                              if (param_3[0x11] != 0) {
                                func_0x0341bad0(param_1,param_3[0x11],0);
                              }
                              plVar29 = (long *)param_3[0x19];
                              uVar10 = func_0x033f9224(param_3);
                              unaff_x22 = (long *)param_3[0x22];
                              unaff_x25 = (undefined *)param_3[0x1b];
                              unaff_x23 = (long *)(ulong)uVar10;
                              unaff_x24 = (long *)func_0x02f10498(*(undefined8 *)PTR_DAT_06d9e9e8);
                              param_6 = (long *)0x0;
                              param_5 = *(long **)PTR_DAT_06d9e9f0;
                              func_0x0537912c(unaff_x24,unaff_x25);
                              if (plVar29 != (long *)0x0) {
                                param_5 = unaff_x22;
                                param_6 = unaff_x24;
                                InGameOneFrameJudgementController__ReflectOneFrameData
                                          (plVar29,uVar10 & 1,unaff_x22,unaff_x24,0);
                                lVar13 = param_3[0x19];
                                if ((lVar13 != 0) && (param_3[10] != 0)) {
                                  param_5 = (long *)(ulong)*(uint *)(lVar13 + 0x8c);
                                  InGameRecord_AddScore(param_3[10],*(undefined4 *)(lVar13 + 0x68));
                                  if ((param_3[0x19] != 0) && (param_3[10] != 0)) {
                                    InGameRecord_AddIPower
                                              (param_3[10],*(undefined4 *)(param_3[0x19] + 0x6c));
                                    lVar13 = param_3[0x19];
                                    if (lVar13 != 0) {
                                      uStack_60 = *(undefined8 *)(lVar13 + 0x88);
                                      uStack_68 = *(undefined8 *)(lVar13 + 0x80);
                                      uStack_70 = *(undefined8 *)(lVar13 + 0x78);
                                      uStack_78 = *(undefined8 *)(lVar13 + 0x70);
                                      param_2 = *(ulong *)(lVar13 + 0x68);
                                      uStack_80 = param_2;
                                      func_0x033fdd08(param_3,&uStack_80);
                                      if (param_3[0x1a] != 0) {
                                        plVar14 = (long *)param_3[0x18];
                                        uVar15 = func_0x034081f0(param_3[0x1a],0);
                                        unaff_x22 = (long *)(uVar15 & 0xffffffff);
                                        uVar11 = InGameManager_getBackgroundUpdateStatus
                                                           (param_3,plVar28);
                                        plVar29 = (long *)0x0;
                                        if (plVar14 != (long *)0x0) {
                                          lVar13 = *plVar14;
                                          uVar15 = (ulong)*(ushort *)(lVar13 + 0x12e);
                                          if (uVar15 != 0) {
                                            piVar27 = (int *)(*(long *)(lVar13 + 0xb0) + 8);
                                            do {
                                              if (*(long *)(piVar27 + -2) == *(long *)puVar34) {
                                                puVar16 = (undefined8 *)
                                                          (lVar13 + (long)(*piVar27 + 0x13) * 0x10 +
                                                          0x138);
                                                goto LAB_033fa12c;
                                              }
                                              uVar15 = uVar15 - 1;
                                              piVar27 = piVar27 + 4;
                                            } while (uVar15 != 0);
                                          }
                                          puVar16 = (undefined8 *)
                                                    func_0x02ea9e1c(plVar14,*(long *)puVar34,0x13);
LAB_033fa12c:
                                          (*(code *)*puVar16)(plVar14,unaff_x22,uVar11,puVar16[1]);
                                          InGameManager_transitionGameEndState(param_3);
                                          plVar29 = (long *)func_0x033fdf18(param_3);
                                          if ((int)plVar28 != 0) {
                                            plVar29 = (long *)InGameManager_updatePlayState
                                                                        (param_1,param_3,1);
                                          }
                                          return plVar29;
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      goto LAB_033fa1ac;
    }
    if ((param_3[0x1d] == 0) || (plVar14 = (long *)param_3[0x16], plVar14 == (long *)0x0))
    goto LAB_033fa1ac;
    iVar12 = *(int *)(param_3[0x1d] + 0x10);
    pcVar35 = (code *)0x33f9cc0;
  }
SUB_034139a0:
  plVar24 = (long *)0x0;
  plVar17 = (long *)func_0x0671d640(0);
  if ((int)plVar17 < 1) {
    return plVar17;
  }
  plVar33 = unaff_x23;
  plVar21 = plVar14;
  uVar15 = param_2;
  if (iVar12 < 7) {
    if (iVar12 == 4) {
      plVar32 = (long *)0x7352000;
      if ((bRam0000000007352be6 & 1) == 0) {
        func_0x02f10210(PTR_DAT_06d82bd8);
        bRam0000000007352be6 = 1;
        uVar15 = param_2;
      }
      plVar17 = (long *)func_0x0671d768(0);
      plVar33 = (long *)PTR_DAT_06d82bd8;
      if (plVar17 == (long *)0x0) {
LAB_03413b48:
        plVar28 = (long *)func_0x02f1049c();
        return plVar28;
      }
      plVar31 = (long *)0x0;
      plVar30 = (long *)0x20;
LAB_03413a8c:
      if ((long)(int)plVar17[3] <= (long)plVar31) {
        return plVar17;
      }
      lVar13 = func_0x0671d768(0);
      if (lVar13 == 0) goto LAB_03413b48;
      param_2 = uVar15;
      uVar20 = param_1;
      uVar22 = unaff_d9;
      if ((long *)(ulong)*(uint *)(lVar13 + 0x18) <= plVar31) {
LAB_03413bd8:
        pcVar35 = (code *)&LAB_03413bdc;
        plVar21 = (long *)func_0x02f104a4();
        puVar5 = (ulong *)&stack0xffffffffffffff40;
        param_3 = plVar14;
        plVar28 = plVar32;
        plVar29 = plVar30;
        plVar32 = plVar31;
        param_1 = uVar20;
        unaff_d9 = uVar22;
        goto LAB_03413bdc;
      }
      iVar12 = func_0x0671c7b0(lVar13 + (long)plVar30,0);
      if (iVar12 == 0) {
        plVar32 = (long *)plVar14[2];
        lVar13 = func_0x0671d768(0);
        if (lVar13 == 0) goto LAB_03413b48;
        param_2 = uVar15;
        if ((long *)(ulong)*(uint *)(lVar13 + 0x18) <= plVar31) goto LAB_03413bd8;
        func_0x0671c770(lVar13 + (long)plVar30,0);
        if (plVar32 == (long *)0x0) goto LAB_03413b48;
        plVar32 = (long *)func_0x03982fc8(plVar32,0);
        lVar13 = *plVar33;
        if (*(int *)(lVar13 + 0xe0) == 0) {
          func_0x02f10384(lVar13);
        }
        plVar24 = (long *)0x0;
        uVar18 = func_0x066be9cc(plVar32,0);
        if ((uVar18 & 1) == 0) {
          if (plVar32 == (long *)0x0) goto LAB_03413b48;
          if (*(int *)((long)plVar32 + 0x24) == 0x10) {
            lVar13 = func_0x0671d768(0);
            if (lVar13 == 0) goto LAB_03413b48;
            param_2 = uVar15;
            if (*(uint *)(lVar13 + 0x18) <= (uint)plVar31) goto LAB_03413bd8;
            uVar20 = func_0x0671c770(lVar13 + (long)plVar30,0);
            param_2 = uVar15;
            lVar13 = func_0x0671d768(0);
            if (lVar13 == 0) goto LAB_03413b48;
            uVar22 = uVar15;
            if ((uint)plVar31 < *(uint *)(lVar13 + 0x18)) {
              uVar22 = func_0x0671c768(lVar13 + (long)plVar30,0);
              plVar33 = (long *)0x0;
              param_6 = (long *)(uVar22 & 0xffffffff);
              goto SUB_0341422c;
            }
            goto LAB_03413bd8;
          }
        }
      }
      plVar31 = (long *)((long)plVar31 + 1);
      plVar17 = (long *)func_0x0671d768(0);
      plVar30 = (long *)((long)plVar30 + 0x44);
      if (plVar17 == (long *)0x0) goto LAB_03413b48;
      goto LAB_03413a8c;
    }
    plVar32 = unaff_x22;
    if (iVar12 != 5) {
      return plVar17;
    }
  }
  else {
    if (iVar12 == 7) goto LAB_03413f4c;
    plVar32 = plVar24;
    if (iVar12 == 0xf) {
LAB_03414128:
      puVar8 = (ulong *)((long)puVar7 + -0x80);
      puVar9 = (undefined1 *)((long)puVar7 + -0x80);
      *(ulong *)((long)puVar7 + -0x30) = unaff_d9;
      *(ulong *)((long)puVar7 + -0x28) = param_1;
      *(code **)((long)puVar7 + -0x20) = pcVar35;
      *(long **)((long)puVar7 + -0x18) = plVar29;
      *(long **)((long)puVar7 + -0x10) = plVar28;
      *(long **)((long)puVar7 + -8) = param_3;
      *(undefined4 *)((long)puVar7 + -0x40) = 0;
      *(undefined8 *)((long)puVar7 + -0x58) = 0;
      *(undefined8 *)((long)puVar7 + -0x60) = 0;
      *(undefined8 *)((long)puVar7 + -0x48) = 0;
      *(undefined8 *)((long)puVar7 + -0x50) = 0;
      *(undefined8 *)((long)puVar7 + -0x78) = 0;
      *(undefined8 *)((long)puVar7 + -0x80) = 0;
      *(undefined8 *)((long)puVar7 + -0x68) = 0;
      *(undefined8 *)((long)puVar7 + -0x70) = 0;
      plVar17 = (long *)func_0x0671d768(0);
      if (plVar17 != (long *)0x0) {
        plVar28 = (long *)0x0;
        plVar29 = (long *)0x20;
        do {
          if ((long)(int)plVar17[3] <= (long)plVar28) {
            return plVar17;
          }
          lVar13 = func_0x0671d768(0);
          if (lVar13 == 0) break;
          if ((long *)(ulong)*(uint *)(lVar13 + 0x18) <= plVar28) {
            pcVar35 = (code *)&SUB_0341422c;
            uVar20 = func_0x02f104a4();
            plVar33 = extraout_x1;
            param_3 = plVar14;
            goto SUB_0341422c;
          }
          plVar32 = (long *)0x44;
          func_0x06977060((undefined1 *)((long)puVar7 + -0x80),lVar13 + (long)plVar29);
          iVar12 = func_0x0671c768((undefined1 *)((long)puVar7 + -0x80),0);
          if (plVar14[4] == 0) break;
          if ((iVar12 < *(int *)(plVar14[4] + 0x18)) &&
             (iVar12 = func_0x0671c7b0((undefined1 *)((long)puVar7 + -0x80),0), iVar12 == 0)) {
            unaff_d9 = func_0x0671c770((undefined1 *)((long)puVar7 + -0x80),0);
            uVar22 = func_0x0671c768((undefined1 *)((long)puVar7 + -0x80),0);
            uVar22 = uVar22 & 0xffffffff;
            puVar36 = (undefined1 *)0x34141f8;
            param_6 = plVar14;
            plVar32 = plVar28;
            param_1 = uVar15;
            uVar18 = unaff_d9;
            uVar20 = uVar15;
            goto SUB_0341431c;
          }
          plVar28 = (long *)((long)plVar28 + 1);
          plVar29 = (long *)((long)plVar29 + 0x44);
          plVar17 = (long *)func_0x0671d768(0);
        } while (plVar17 != (long *)0x0);
      }
      plVar28 = (long *)func_0x02f1049c();
      return plVar28;
    }
    puVar5 = &uStack_80;
    plVar32 = unaff_x22;
    if (iVar12 != 0x11) {
      return plVar17;
    }
  }
LAB_03413bdc:
  puVar8 = (ulong *)((long)puVar5 + -0x60);
  puVar6 = (ulong *)((long)puVar5 + -0x60);
  *(code **)((long)puVar5 + -0x60) = pcVar35;
  *(undefined8 *)((long)puVar5 + -0x50) = unaff_x28;
  *(undefined8 *)((long)puVar5 + -0x48) = unaff_x27;
  *(undefined **)((long)puVar5 + -0x40) = unaff_x26;
  *(undefined **)((long)puVar5 + -0x38) = unaff_x25;
  *(long **)((long)puVar5 + -0x30) = unaff_x24;
  *(long **)((long)puVar5 + -0x28) = plVar33;
  *(long **)((long)puVar5 + -0x20) = plVar32;
  *(long **)((long)puVar5 + -0x18) = plVar29;
  *(long **)((long)puVar5 + -0x10) = plVar28;
  *(long **)((long)puVar5 + -8) = param_3;
  plVar28 = (long *)0x7352000;
  plVar14 = param_6;
  uVar15 = param_2;
  if ((bRam0000000007352be7 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d96850);
    func_0x02f10210(PTR_DAT_06d82bd8);
    bRam0000000007352be7 = 1;
    plVar14 = param_6;
    uVar15 = param_2;
  }
  plVar17 = (long *)func_0x0671d768(0);
  puVar4 = PTR_DAT_06d96850;
  puVar34 = PTR_DAT_06d82bd8;
  param_6 = plVar29;
  param_3 = plVar21;
  if (plVar17 != (long *)0x0) {
    unaff_x24 = (long *)0x0;
    plVar28 = plVar21 + 3;
    lVar13 = 0x20;
    do {
      if ((long)(int)plVar17[3] <= (long)unaff_x24) {
        return plVar17;
      }
      *plVar28 = 0;
      func_0x02f101bc(plVar28,0);
      lVar19 = func_0x0671d768(0);
      unaff_x25 = puVar34;
      if (lVar19 == 0) break;
      if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x24) goto LAB_03413f3c;
      uVar10 = func_0x0671c768(lVar19 + lVar13,0);
      if (plVar21[4] == 0) break;
      param_6 = (long *)(ulong)uVar10;
      if ((int)uVar10 < *(int *)(plVar21[4] + 0x18)) {
        lVar19 = func_0x0671d768(0);
        if (lVar19 == 0) break;
        if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x24) goto LAB_03413f3c;
        uVar11 = func_0x0671c7b0(lVar19 + lVar13,0);
        plVar29 = param_6;
        switch(uVar11) {
        case 0:
          plVar32 = (long *)plVar21[2];
          lVar19 = func_0x0671d768(0);
          if (lVar19 == 0) goto LAB_03413f38;
          if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x24) goto LAB_03413f3c;
          func_0x0671c770(lVar19 + lVar13,0);
          if (plVar32 == (long *)0x0) goto LAB_03413f38;
          plVar32 = (long *)func_0x03982fc8(plVar32,0);
          if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
            func_0x02f10384(*(long *)puVar34);
          }
          uVar20 = func_0x066c1880(plVar32,0);
          if ((uVar20 & 1) == 0) goto LAB_03413d8c;
          plVar33 = (long *)plVar21[4];
          if (plVar33 == (long *)0x0) goto LAB_03413f38;
          if ((plVar32 != (long *)0x0) &&
             (lVar19 = func_0x02f10388(plVar32,*(undefined8 *)(*plVar33 + 0x40)), lVar19 == 0))
          goto code_r0x03413f40;
          if (*(uint *)(plVar33 + 3) <= uVar10) goto LAB_03413f3c;
          plVar33[(long)(int)uVar10 + 4] = (long)plVar32;
          func_0x02f101bc(plVar33 + (long)(int)uVar10 + 4,plVar32);
          if (((plVar21[2] == 0) || (plVar32 == (long *)0x0)) ||
             (lVar19 = *(long *)(plVar21[2] + 0xb0), lVar19 == 0)) goto LAB_03413f38;
          lVar19 = func_0x03405f38(lVar19,*(undefined4 *)((long)plVar32 + 0x24));
          *plVar28 = lVar19;
          func_0x02f101bc(plVar28,lVar19);
          plVar33 = (long *)*plVar28;
          if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
            func_0x02f10384();
          }
          plVar24 = (long *)0x0;
          uVar20 = func_0x066bdae8(plVar33,0);
          if ((uVar20 & 1) != 0) {
            if (*plVar28 == 0) goto LAB_03413f38;
            plVar33 = (long *)func_0x0397d538(*plVar28,uVar10,0);
            if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
              func_0x02f10384(*(long *)puVar34);
            }
            plVar24 = (long *)0x0;
            uVar20 = func_0x066bdae8(plVar33,0);
            if ((uVar20 & 1) != 0) {
              if (*plVar28 != 0) {
                plVar24 = (long *)0x0;
                plVar17 = (long *)func_0x0397d538(*plVar28,uVar10);
                if (plVar17 != (long *)0x0) {
                  bVar3 = *(byte *)(*(long *)puVar4 + 0x130);
                  if ((bVar3 <= *(byte *)(*plVar17 + 0x130)) &&
                     (*(long *)(*(long *)(*plVar17 + 200) + (ulong)bVar3 * 8 + -8) ==
                      *(long *)puVar4)) break;
                }
                goto LAB_03413d8c;
              }
              goto LAB_03413f38;
            }
          }
          break;
        case 1:
        case 2:
        case 3:
          lVar19 = plVar21[4];
          if (lVar19 == 0) goto LAB_03413f38;
          if (*(uint *)(lVar19 + 0x18) <= uVar10) goto LAB_03413f3c;
          plVar32 = *(long **)(lVar19 + (long)(int)uVar10 * 8 + 0x20);
          if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
            func_0x02f10384();
          }
          uVar20 = func_0x066c1880(plVar32,0);
          if ((uVar20 & 1) == 0) goto LAB_03413d8c;
          break;
        default:
          plVar32 = (long *)0x0;
        }
        lVar19 = func_0x0671d768(0);
        if (lVar19 != 0) {
          if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x24) goto LAB_03413f3c;
          uVar20 = func_0x0671c7b0(lVar19 + lVar13,0);
          plVar33 = (long *)(uVar20 & 0xffffffff);
          lVar19 = func_0x0671d768(0);
          if (lVar19 != 0) {
            if (unaff_x24 < (long *)(ulong)*(uint *)(lVar19 + 0x18)) {
              uVar20 = func_0x0671c770(lVar19 + lVar13,0);
              pcVar35 = (code *)&LAB_03413d8c;
              unaff_x22 = plVar32;
              unaff_x23 = plVar33;
              goto SUB_0341422c;
            }
            goto LAB_03413f3c;
          }
        }
        break;
      }
LAB_03413d8c:
      unaff_x24 = (long *)((long)unaff_x24 + 1);
      plVar17 = (long *)func_0x0671d768(0);
      lVar13 = lVar13 + 0x44;
    } while (plVar17 != (long *)0x0);
  }
LAB_03413f38:
  func_0x02f1049c();
  puVar34 = unaff_x25;
LAB_03413f3c:
  func_0x02f104a4();
  plVar29 = param_6;
code_r0x03413f40:
  uVar25 = func_0x02f104c0();
  pcVar35 = (code *)&LAB_03413f4c;
  plVar21 = (long *)func_0x02f10374(uVar25,0);
  param_6 = plVar14;
  unaff_x22 = plVar32;
  unaff_x23 = plVar33;
  unaff_x25 = puVar34;
  param_2 = uVar15;
LAB_03413f4c:
  puVar7 = (ulong *)((long)puVar6 + -0x40);
  *(code **)((long)puVar6 + -0x40) = pcVar35;
  *(undefined **)((long)puVar6 + -0x38) = unaff_x25;
  *(long **)((long)puVar6 + -0x30) = unaff_x24;
  *(long **)((long)puVar6 + -0x28) = unaff_x23;
  *(long **)((long)puVar6 + -0x20) = unaff_x22;
  *(long **)((long)puVar6 + -0x18) = plVar29;
  *(long **)((long)puVar6 + -0x10) = plVar28;
  *(long **)((long)puVar6 + -8) = param_3;
  plVar28 = (long *)0x7352000;
  if ((bRam0000000007352be8 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d82bd8);
    bRam0000000007352be8 = 1;
  }
  plVar14 = (long *)func_0x0671d768(0);
  unaff_x23 = (long *)PTR_DAT_06d82bd8;
  if (plVar14 != (long *)0x0) {
    unaff_x22 = (long *)0x0;
    lVar13 = 0x20;
    do {
      if ((long)(int)plVar14[3] <= (long)unaff_x22) {
        return plVar14;
      }
      lVar19 = func_0x0671d768(0);
      if (lVar19 == 0) break;
      if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x22) {
LAB_03414118:
        func_0x02f104a4();
LAB_0341411c:
        uVar25 = func_0x02f104c0();
        pcVar35 = (code *)&LAB_03414128;
        plVar14 = (long *)func_0x02f10374(uVar25,0);
        plVar32 = plVar24;
        param_3 = plVar21;
        uVar15 = param_2;
        goto LAB_03414128;
      }
      uVar10 = func_0x0671c768(lVar19 + lVar13,0);
      if (plVar21[4] == 0) break;
      plVar28 = (long *)(ulong)uVar10;
      if (*(int *)(plVar21[4] + 0x18) <= (int)uVar10) goto LAB_034140ec;
      lVar19 = func_0x0671d768(0);
      if (lVar19 == 0) break;
      if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x22) goto LAB_03414118;
      iVar12 = func_0x0671c7b0(lVar19 + lVar13,0);
      if (iVar12 == 3) {
        lVar19 = plVar21[4];
        if (lVar19 == 0) break;
        if (*(uint *)(lVar19 + 0x18) <= uVar10) goto LAB_03414118;
        plVar28 = *(long **)(lVar19 + (long)(int)uVar10 * 8 + 0x20);
        if (*(int *)(*unaff_x23 + 0xe0) == 0) {
          func_0x02f10384();
        }
        func_0x066c1880(plVar28,0);
      }
      else if (iVar12 == 0) {
        plVar29 = (long *)plVar21[2];
        lVar19 = func_0x0671d768(0);
        if (lVar19 == 0) break;
        if ((long *)(ulong)*(uint *)(lVar19 + 0x18) <= unaff_x22) goto LAB_03414118;
        func_0x0671c770(lVar19 + lVar13,0);
        if (plVar29 == (long *)0x0) break;
        plVar29 = (long *)func_0x03982fc8(plVar29,0);
        if (*(int *)(*unaff_x23 + 0xe0) == 0) {
          func_0x02f10384(*unaff_x23);
        }
        uVar15 = func_0x066c1880(plVar29,0);
        if ((uVar15 & 1) != 0) {
          plVar14 = (long *)plVar21[4];
          if (plVar14 == (long *)0x0) break;
          if ((plVar29 != (long *)0x0) &&
             (lVar19 = func_0x02f10388(plVar29,*(undefined8 *)(*plVar14 + 0x40)), lVar19 == 0))
          goto LAB_0341411c;
          if (*(uint *)(plVar14 + 3) <= uVar10) goto LAB_03414118;
          plVar14[(long)(int)uVar10 + 4] = (long)plVar29;
          func_0x02f101bc(plVar14 + (long)(int)uVar10 + 4,plVar29);
        }
      }
LAB_034140ec:
      unaff_x22 = (long *)((long)unaff_x22 + 1);
      plVar14 = (long *)func_0x0671d768(0);
      lVar13 = lVar13 + 0x44;
    } while (plVar14 != (long *)0x0);
  }
  plVar28 = (long *)func_0x02f1049c();
  return plVar28;
SUB_0341431c:
  puVar8 = (ulong *)(puVar9 + -0x30);
  *(ulong *)(puVar9 + -0x30) = uVar20;
  *(ulong *)(puVar9 + -0x28) = uVar18;
  *(undefined1 **)(puVar9 + -0x20) = puVar36;
  *(long **)(puVar9 + -0x18) = plVar29;
  *(long **)(puVar9 + -0x10) = plVar32;
  *(long **)(puVar9 + -8) = param_6;
  plVar29 = (long *)0x7352000;
  param_6 = (long *)(uVar22 & 0xffffffff);
  if ((bRam0000000007352bea & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d82bd8);
    bRam0000000007352bea = 1;
  }
  puVar34 = PTR_DAT_06d82bd8;
  if (plVar14[2] == 0) {
LAB_034143e8:
    uVar25 = func_0x02f1049c();
    *(undefined8 *)(puVar9 + -0x50) = 0x34143ec;
    *(long **)(puVar9 + -0x40) = plVar14;
    *(long **)(puVar9 + -0x38) = param_6;
    if (pcRam0000000007369f68 == (code *)0x0) {
      pcRam0000000007369f68 = (code *)func_0x02f101d4(&UNK_0167dba8);
    }
                    /* WARNING: Could not recover jumptable at 0x066bb11c. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    plVar28 = (long *)(*pcRam0000000007369f68)(uVar25);
    return plVar28;
  }
  uVar15 = param_1;
  plVar32 = (long *)func_0x03982fc8(unaff_d9,plVar14[2],0);
  if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
    func_0x02f10384(*(long *)puVar34);
  }
  uVar20 = func_0x066c1880(plVar32,0);
  if ((uVar20 & 1) == 0) {
    return (long *)0x0;
  }
  plVar14 = (long *)0x0;
  if (plVar32 == (long *)0x0) goto LAB_034143e8;
  if (1 < *(int *)((long)plVar32 + 0x24) - 0x11U) {
    return (long *)0x0;
  }
  uVar20 = func_0x0671d388(0);
  plVar33 = (long *)0x0;
  pcVar35 = (code *)0x34143cc;
  param_3 = param_6;
  plVar28 = plVar32;
SUB_0341422c:
  puVar34 = PTR_DAT_06d82bd8;
  puVar9 = (undefined1 *)((long)puVar8 + -0x40);
  *(ulong *)((long)puVar8 + -0x40) = unaff_d9;
  *(ulong *)((long)puVar8 + -0x38) = param_1;
  *(code **)((long)puVar8 + -0x30) = pcVar35;
  *(long **)((long)puVar8 + -0x28) = unaff_x23;
  *(long **)((long)puVar8 + -0x20) = unaff_x22;
  *(long **)((long)puVar8 + -0x18) = plVar29;
  *(long **)((long)puVar8 + -0x10) = plVar28;
  *(long **)((long)puVar8 + -8) = param_3;
  param_6 = (long *)((ulong)param_6 & 0xffffffff);
  unaff_x22 = (long *)((ulong)plVar33 & 0xffffffff);
  param_1 = uVar15;
  if ((bRam0000000007352be9 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d82bd8);
    bRam0000000007352be9 = 1;
  }
  if (*(int *)(*(long *)puVar34 + 0xe0) == 0) {
    func_0x02f10384();
  }
  uVar10 = func_0x066c1880(plVar32,0);
  plVar29 = (long *)(ulong)uVar10;
  if ((uVar10 & 1) == 0) goto LAB_03414300;
  switch(unaff_x22) {
  case (long *)0x0:
    if (plVar32 != (long *)0x0) {
      pcVar35 = *(code **)(*plVar32 + 0x178);
      uVar25 = *(undefined8 *)(*plVar32 + 0x180);
      goto code_r0x034142ec;
    }
    break;
  case (long *)0x1:
  case (long *)0x2:
    if (plVar32 != (long *)0x0) {
      pcVar35 = *(code **)(*plVar32 + 0x188);
      uVar25 = *(undefined8 *)(*plVar32 + 400);
      goto code_r0x034142ec;
    }
    break;
  case (long *)0x3:
    if (plVar32 != (long *)0x0) {
      pcVar35 = *(code **)(*plVar32 + 0x198);
      uVar25 = *(undefined8 *)(*plVar32 + 0x1a0);
code_r0x034142ec:
      (*pcVar35)(uVar20,uVar15,plVar32,param_6,uVar25);
LAB_03414300:
      return (long *)(ulong)(uVar10 & 1);
    }
    break;
  default:
    goto LAB_03414300;
  }
  puVar36 = &SUB_0341431c;
  plVar14 = (long *)func_0x02f1049c();
  uVar22 = extraout_x1_00;
  unaff_x23 = (long *)puVar34;
  unaff_d9 = extraout_d0;
  uVar18 = uVar15;
  goto SUB_0341431c;
}
// RHYTHM_C_SLICE_END	rva=0x32f9bb0
