// RHYTHM_C_SLICE_BEGIN	rva=0x30e1838	target=0x30e1838=NoteSingleBase.forcePerfect	owner=NoteSingleBase	method=forcePerfect	domain=note
// target: 0x30e1838=NoteSingleBase.forcePerfect
// display-name: NoteSingleBase.forcePerfect
// function: NoteSingleBase.forcePerfect
// entry: 031e1838


void NoteSingleBase_forcePerfect(long *param_1)

{
  undefined *puVar1;
  long lVar2;

  puVar1 = PTR_DAT_06d8ea30;
  if ((bRam0000000007351763 & 1) == 0) {
    func_0x02f10210(PTR_DAT_06d8ea30);
    bRam0000000007351763 = 1;
  }
  lVar2 = *(long *)puVar1;
  if (*(int *)(lVar2 + 0xe0) == 0) {
    func_0x02f10384();
    lVar2 = *(long *)puVar1;
  }
                    /* WARNING: Could not recover jumptable at 0x031e18a8. Too many branches */
                    /* WARNING: Treating indirect jump as call */
  (**(code **)(*param_1 + 0x268))
            (**(undefined4 **)(lVar2 + 0xb8),(*(undefined4 **)(lVar2 + 0xb8))[1],param_1,4,0,
             *(undefined8 *)(*param_1 + 0x270));
  return;
}
// RHYTHM_C_SLICE_END	rva=0x30e1838
