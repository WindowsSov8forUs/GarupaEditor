// RHYTHM_C_SLICE_BEGIN	rva=0x321aaa4	target=0x321aaa4=NoteNormal.ExecTouchBegan	owner=NoteNormal	method=ExecTouchBegan	domain=note
// target: 0x321aaa4=NoteNormal.ExecTouchBegan
// display-name: NoteNormal.ExecTouchBegan
// function: NoteNormal.ExecTouchBegan
// entry: 0331aaa4


void NoteNormal_ExecTouchBegan(long *param_1,int param_2,undefined4 param_3)

{
  undefined8 uVar1;

  if (param_2 == -1) {
    return;
  }
  if (param_1[0xc] != 0) {
    *(undefined1 *)(param_1[0xc] + 0x14) = 1;
    uVar1 = NoteBase_GetEffectTargetButton(param_1,0);
    func_0x031e0fec(param_1,param_2,0,param_1[0x12],uVar1,param_3,0);
                    /* WARNING: Could not recover jumptable at 0x0331ab14. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    (**(code **)(*param_1 + 0x228))(param_1,*(undefined8 *)(*param_1 + 0x230));
    return;
  }
  func_0x02f1049c();
  return;
}
// RHYTHM_C_SLICE_END	rva=0x321aaa4
