// RHYTHM_C_SLICE_BEGIN	rva=0x3a77768	target=0x3a77768=NoteFlickBase.forcePerfect	owner=NoteFlickBase	method=forcePerfect	domain=note
// target: 0x3a77768=NoteFlickBase.forcePerfect
// display-name: NoteFlickBase.forcePerfect
// function: NoteFlickBase.forcePerfect
// entry: 03b77768


void NoteFlickBase_forcePerfect(long *param_1)

{
  undefined8 uVar1;
  undefined8 uVar2;
  long lVar3;

  NoteSingleBase_forcePerfect(param_1,0);
  uVar1 = (**(code **)(*param_1 + 0x2d8))(param_1,*(undefined8 *)(*param_1 + 0x2e0));
  lVar3 = param_1[0x12];
  if (lVar3 == 0) {
    uVar2 = 0;
  }
  else {
    if (*(uint *)(lVar3 + 0x18) <= *(uint *)(param_1 + 0x17)) {
      lVar3 = func_0x02f104a4();
      *(undefined4 *)(lVar3 + 0x188) = 0;
      return;
    }
    uVar2 = *(undefined8 *)(lVar3 + (long)(int)*(uint *)(param_1 + 0x17) * 8 + 0x20);
  }
                    /* WARNING: Could not recover jumptable at 0x03b777dc. Too many branches */
                    /* WARNING: Treating indirect jump as call */
  (**(code **)(*param_1 + 0x278))(0,0,uVar1,0,param_1,4,uVar2,*(undefined8 *)(*param_1 + 0x280));
  return;
}
// RHYTHM_C_SLICE_END	rva=0x3a77768
