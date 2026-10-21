
/* WARNING: Removing unreachable block (ram,0x004a1083) */
/* WARNING: Removing unreachable block (ram,0x004a1278) */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_004a0f40(int param_1,int param_2,int param_3,uint *param_4,uint param_5)

{
  bool bVar1;
  undefined *puVar2;
  int iVar3;
  uint uVar4;
  uint uVar5;
  int *piVar6;
  undefined4 *in_ECX;
  int iVar7;
  int iVar8;
  undefined1 *puVar9;
  int in_EDX;
  undefined4 *puVar10;
  bool bVar11;
  int *local_494;
  undefined4 local_48c;
  undefined4 local_488;
  int local_484;
  int local_480;
  undefined4 local_444;
  undefined4 uStack_440;
  undefined4 uStack_43c;
  undefined4 uStack_438;
  undefined4 local_434;
  undefined4 uStack_430;
  undefined4 uStack_42c;
  undefined4 uStack_428;
  uint local_424;
  undefined1 local_40c [1028];
  uint local_8;
  
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  bVar1 = false;
  if ((param_5 & 0x10) == 0) {
    if (param_2 < 9) {
      iVar3 = DAT_0069b6d0 * 0x68;
    }
    else {
      iVar3 = DAT_0069b6d4 * 0x68;
    }
  }
  else {
    iVar3 = DAT_0069b6d8 * 0x68;
  }
  local_480 = 1;
  if (1 < in_EDX) {
    do {
      local_480 = local_480 * 2;
    } while (local_480 < in_EDX);
  }
  local_484 = 1;
  if (1 < param_1) {
    do {
      local_484 = local_484 * 2;
    } while (local_484 < param_1);
  }
  bVar11 = DAT_00696e44 != 0;
  in_ECX[2] = local_480;
  if (bVar11) {
    local_484 = in_EDX;
  }
  in_ECX[3] = local_484;
  in_ECX[6] = &DAT_0069a280 + iVar3;
  uVar5 = param_5 | 0x100000;
  if (*(int *)((int)&DAT_0069a2c0 + iVar3) == 0) {
    uVar5 = param_5;
  }
  uVar4 = uVar5 | 0x200000;
  if ((&DAT_0069a2bc)[iVar3] != '\a') {
    uVar4 = uVar5;
  }
  if (((uVar4 & 0x20) != 0) && (DAT_006a40f8 == 0x29)) {
    uVar4 = uVar4 | 0x800000;
  }
  in_ECX[10] = uVar4;
  iVar7 = 0;
  do {
    if ((local_480 >> ((byte)iVar7 & 0x1f) & 1U) != 0) break;
    iVar7 = iVar7 + 1;
  } while (iVar7 < 10);
  iVar8 = 0;
  in_ECX[7] = (&DAT_0062156c)[iVar7];
  do {
    if ((local_484 >> ((byte)iVar8 & 0x1f) & 1U) != 0) break;
    iVar8 = iVar8 + 1;
  } while (iVar8 < 10);
  in_ECX[8] = (&DAT_0062156c)[iVar8];
  puVar10 = &local_48c;
  for (iVar7 = 0x1f; iVar7 != 0; iVar7 = iVar7 + -1) {
    *puVar10 = 0;
    puVar10 = puVar10 + 1;
  }
  local_48c = 0x7c;
  local_488 = 0x1007;
  local_444 = *(undefined4 *)(&DAT_0069a280 + iVar3);
  uStack_440 = *(undefined4 *)(iVar3 + 0x69a284);
  uStack_43c = *(undefined4 *)(iVar3 + 0x69a288);
  uStack_438 = *(undefined4 *)((int)&DAT_0069a28c + iVar3);
  local_424 = 0x1800;
  local_434 = *(undefined4 *)(&DAT_0069a290 + iVar3);
  uStack_430 = *(undefined4 *)(iVar3 + 0x69a294);
  uStack_42c = *(undefined4 *)(iVar3 + 0x69a298);
  uStack_428 = *(undefined4 *)(iVar3 + 0x69a29c);
  if (((param_5 & 0x20) != 0) && (DAT_006a40f8 == 0x29)) {
    local_488 = 0x11007;
    bVar1 = true;
  }
  _DAT_00621824 = (**(code **)(*DAT_00621828 + 0x18))();
  if (_DAT_00621824 < 0) {
    if (*(int *)(PTR_DAT_00513214 + 0x34) < 2) {
      *(undefined4 *)(PTR_DAT_00513214 + 0x34) = 2;
    }
  }
  else {
    if (*(int *)((int)&DAT_0069a2c4 + iVar3) != 0) {
      memset(local_40c,0,0x400);
      if (param_4 != (uint *)0x0) {
        puVar9 = local_40c + 1;
        iVar7 = 0x100;
        bVar11 = false;
        do {
          iVar7 = iVar7 + -1;
          uVar5 = *param_4 & 0xffffff;
          if ((bVar11) && (uVar5 == 0)) {
            uVar5 = 1;
          }
          puVar9[1] = (char)uVar5;
          param_4 = (uint *)((int)param_4 + (4 - (uint)((param_5 & 0x40) != 0)));
          *puVar9 = (char)(uVar5 >> 8);
          puVar9[-1] = (char)(uVar5 >> 0x10);
          puVar9 = puVar9 + 4;
          if (((param_5 & 0x20) == 0) || (DAT_006a40f8 != 0x29)) {
            bVar11 = false;
          }
          else {
            bVar11 = true;
          }
        } while (iVar7 != 0);
      }
      _DAT_00621824 = (**(code **)(*DAT_00621828 + 0x14))();
      _DAT_00621824 = (**(code **)(*(int *)*in_ECX + 0x7c))();
      (**(code **)(*local_494 + 8))();
      if (bVar1) {
        (**(code **)(*(int *)*in_ECX + 0x74))();
      }
    }
    piVar6 = (int *)*in_ECX;
    puVar10 = &local_48c;
    for (iVar7 = 0x1f; iVar7 != 0; iVar7 = iVar7 + -1) {
      *puVar10 = 0;
      puVar10 = puVar10 + 1;
    }
    local_48c = 0x7c;
    _DAT_00621824 = (**(code **)(*piVar6 + 0x58))();
    if (-1 < _DAT_00621824) {
      local_488 = 0x1007;
      local_424 = 0x4000;
      if (DAT_00621884 != 0) {
        local_424 = 0x800;
      }
      local_424 = local_424 | 0x4001000;
      _DAT_00621824 = (**(code **)(*DAT_00621828 + 0x18))();
      if (_DAT_00621824 < 0) {
LAB_004a12f5:
        puVar2 = PTR_DAT_00513214;
        if (*(int *)(PTR_DAT_00513214 + 0x34) < 5) {
          *(undefined4 *)(PTR_DAT_00513214 + 0x34) = 5;
        }
        puVar2[9] = 0;
        __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
        return;
      }
      if (*(int *)((int)&DAT_0069a2c4 + iVar3) != 0) {
        memset(local_40c,0,0x400);
        _DAT_00621824 = (**(code **)(*DAT_00621828 + 0x14))();
        if (_DAT_00621824 < 0) goto LAB_004a12f5;
        _DAT_00621824 = (**(code **)(*(int *)in_ECX[1] + 0x7c))();
        if (_DAT_00621824 < 0) goto LAB_004a1136;
        if (bVar1) {
          (**(code **)(*(int *)in_ECX[1] + 0x74))();
        }
      }
      DAT_00698c78 = DAT_00698c78 + 1;
      if (param_3 == 0) {
        iVar3 = FUN_004a02c0();
        if (iVar3 == 0) goto LAB_004a1136;
      }
      else {
        iVar3 = FUN_004a0ae0();
        if (iVar3 == 0) {
          __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
          return;
        }
      }
      if ((param_5 & 8) == 0) {
LAB_004a147c:
        __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
        return;
      }
      iVar3 = 0;
      piVar6 = &DAT_00698c7c;
      while (*piVar6 != 0) {
        piVar6 = piVar6 + 0xb;
        iVar3 = iVar3 + 1;
        if (0x69a27b < (int)piVar6) {
          __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
          return;
        }
      }
      if (iVar3 != -1) {
        (&DAT_00698c8c)[iVar3 * 0xb] = 0xffffffff;
        iVar7 = FUN_004a0f40();
        if (iVar7 != 0) {
          in_ECX[5] = iVar3;
          goto LAB_004a147c;
        }
      }
    }
  }
LAB_004a1136:
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

