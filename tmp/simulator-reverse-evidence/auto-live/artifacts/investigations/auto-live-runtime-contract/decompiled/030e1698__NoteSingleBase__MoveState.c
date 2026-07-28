// RHYTHM_C_SLICE_BEGIN	rva=0x30e1698	target=0x30e1698=NoteSingleBase.MoveState	owner=NoteSingleBase	method=MoveState	domain=note
// target: 0x30e1698=NoteSingleBase.MoveState
// display-name: NoteSingleBase.MoveState
// function: NoteSingleBase.MoveState
// entry: 031e1698


void NoteSingleBase_MoveState(undefined8 param_1,long *param_2)

{
  undefined *puVar1;
  int iVar2;
  undefined4 uVar3;
  ulong uVar4;
  long lVar5;
  long *plVar6;
  undefined8 uVar7;
  code *UNRECOVERED_JUMPTABLE;
  float fVar8;
  undefined4 uStack_34;
  undefined8 uStack_30;
  long *plStack_28;

  if ((bRam0000000007351762 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d8ea28);
    bRam0000000007351762 = 1;
  }
  NoteBase_Move(param_1,param_2,0);
  if (param_2[0x1f] == 0) {
LAB_031e17c4:
    plVar6 = (long *)func_0x02f1049c();
    uStack_30 = 0x31e17c8;
    plStack_28 = param_2;
    NoteBase_onMiss(plVar6,0);
    uStack_34 = 0;
    uVar3 = func_0x031e0954(plVar6,0,&uStack_34);
    lVar5 = plVar6[0xc];
    if (lVar5 != 0) {
      NoteBase__Miss(plVar6,0,uVar3,*(undefined8 *)(lVar5 + 0x28),*(undefined4 *)(lVar5 + 0x10),
                     uStack_34,0);
                    /* WARNING: Could not recover jumptable at 0x031e1830. Too many branches */
                    /* WARNING: Treating indirect jump as call */
      (**(code **)(*plVar6 + 0x228))(plVar6,*(undefined8 *)(*plVar6 + 0x230));
      return;
    }
    plVar6 = (long *)func_0x02f1049c();
    puVar1 = PTR_DAT_06d8ea30;
    if ((bRam0000000007351763 & 1) == 0) {
      func_0x02f10210(PTR_DAT_06d8ea30);
      bRam0000000007351763 = 1;
    }
    lVar5 = *(long *)puVar1;
    if (*(int *)(lVar5 + 0xe0) == 0) {
      func_0x02f10384();
      lVar5 = *(long *)puVar1;
    }
                    /* WARNING: Could not recover jumptable at 0x031e18a8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    (**(code **)(*plVar6 + 0x268))
              (**(undefined4 **)(lVar5 + 0xb8),(*(undefined4 **)(lVar5 + 0xb8))[1],plVar6,4,0,
               *(undefined8 *)(*plVar6 + 0x270));
    return;
  }
  fVar8 = (float)NoteManager_GetAdjustMusicPos(param_2[0x1f],0);
  if (param_2[0xc] == 0) goto LAB_031e17c4;
  if (0.0 <= fVar8 - (float)*(int *)(param_2[0xc] + 0x58)) {
    *(float *)((long)param_2 + 0x184) = *(float *)((long)param_2 + 0x184) + (float)param_1;
    if (param_2[0x2a] == 0) goto LAB_031e17c4;
    uVar4 = func_0x033f1e68(param_2[0x2a],0);
    if ((uVar4 & 1) == 0) {
      lVar5 = param_2[0x1e];
      if (lVar5 == 0) goto LAB_031e17c4;
      iVar2 = (**(code **)(lVar5 + 0x18))
                        (*(undefined8 *)(lVar5 + 0x40),*(undefined8 *)(lVar5 + 0x28));
      if (iVar2 != 0xe) {
        fVar8 = *(float *)((long)param_2 + 0x184);
        goto LAB_031e1768;
      }
    }
    UNRECOVERED_JUMPTABLE = *(code **)(*param_2 + 0x2c8);
    uVar7 = *(undefined8 *)(*param_2 + 0x2d0);
  }
  else {
    fVar8 = 0.0;
    *(undefined4 *)((long)param_2 + 0x184) = 0;
LAB_031e1768:
    puVar1 = PTR_DAT_06d8ea28;
    lVar5 = *(long *)PTR_DAT_06d8ea28;
    if (*(int *)(lVar5 + 0xe0) == 0) {
      func_0x02f10384();
      lVar5 = *(long *)puVar1;
    }
    if (fVar8 <= **(float **)(lVar5 + 0xb8)) {
      return;
    }
    UNRECOVERED_JUMPTABLE = *(code **)(*param_2 + 0x2b8);
    uVar7 = *(undefined8 *)(*param_2 + 0x2c0);
  }
                    /* WARNING: Could not recover jumptable at 0x031e17b0. Too many branches */
                    /* WARNING: Treating indirect jump as call */
  (*UNRECOVERED_JUMPTABLE)(param_2,uVar7);
  return;
}
// RHYTHM_C_SLICE_END	rva=0x30e1698
