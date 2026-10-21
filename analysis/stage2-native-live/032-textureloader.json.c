
void FUN_004a5d20(int param_1,int param_2,undefined4 param_3,int param_4,uint param_5)

{
  uint uVar1;
  bool bVar2;
  int *piVar3;
  uint *puVar4;
  undefined4 uVar5;
  int in_ECX;
  int iVar6;
  ushort *puVar7;
  uint uVar8;
  int iVar9;
  int in_EDX;
  uint uVar10;
  uint uVar11;
  int iVar12;
  undefined8 uVar13;
  int local_314;
  int local_310;
  uint local_30c;
  undefined1 local_308 [504];
  uint local_110 [65];
  uint local_c;
  
  local_c = DAT_005122ac ^ (uint)&stack0xfffffffc;
  local_310 = 0;
  puVar4 = local_110;
  for (iVar6 = 0x40; iVar6 != 0; iVar6 = iVar6 + -1) {
    *puVar4 = param_5;
    puVar4 = puVar4 + 1;
  }
  if (DAT_00621538 != 0) {
    uVar10 = (uint)*(ushort *)(DAT_00791598 + 0xa8);
    if (uVar10 != 0) {
      puVar7 = (ushort *)(DAT_00791590 + 6);
      do {
        if ((*(uint *)(puVar7 + 3) & 0xe0000) != 0) {
          local_110[*puVar7 & 0x3f] = local_110[*puVar7 & 0x3f] | 4;
        }
        puVar7 = puVar7 + 8;
        uVar10 = uVar10 - 1;
      } while (uVar10 != 0);
    }
    FUN_004a6ed0(local_110,0,0);
  }
  uVar10 = 0;
  if (0 < in_ECX) {
    piVar3 = (int *)(param_2 + 8);
    do {
      if ((param_5 & 2) == 0) {
        local_30c = (uint)*(ushort *)(piVar3 + -2);
        local_310 = *piVar3;
        uVar8 = (uint)*(ushort *)((int)piVar3 + -6);
      }
      else {
        local_30c = 0x100;
        uVar8 = 0x100;
      }
      if (((int)uVar10 < in_EDX) || (param_1 + in_EDX + -1 < (int)uVar10)) {
        puVar4 = local_110 + uVar10;
        *puVar4 = *puVar4 | 0x20;
      }
      else {
        puVar4 = local_110 + uVar10;
        *puVar4 = *puVar4 | 1;
      }
      uVar1 = *puVar4;
      if ((local_30c != 0) && (uVar8 != 0)) {
        if (DAT_00698c78 != 0x7f) {
          uVar11 = uVar1;
          if ((uVar1 & 1) == 0) {
            uVar11 = uVar1 | 0x20;
          }
          uVar13 = FUN_004a00c0();
          iVar6 = (int)uVar13;
          if (iVar6 != -1) {
            if ((uVar10 != 0x3f) && ((int)DAT_006963ec < (int)uVar10)) {
              DAT_006963ec = uVar10;
            }
            (&DAT_006968d8)[uVar10] = iVar6;
            (&DAT_00698c8c)[iVar6 * 0xb] = uVar10;
            iVar6 = FUN_004a0f40(uVar8,8,param_4 + local_310,(int)((ulonglong)uVar13 >> 0x20),uVar11
                                );
            if (iVar6 != 0) goto LAB_004a5f01;
          }
        }
        bVar2 = true;
        goto LAB_004a5ff0;
      }
LAB_004a5f01:
      if ((uVar1 & 0xc) != 0) {
        iVar9 = 0;
        iVar12 = 0;
        local_314 = 0;
        iVar6 = DAT_00791590;
        if (*(short *)(DAT_00791598 + 0xa8) != 0) {
          do {
            if (((*(ushort *)(iVar6 + 6) & 0x3f) == uVar10) &&
               ((*(uint *)(iVar6 + 0xc) & 0xe0000) != 0)) {
              iVar9 = FUN_004a5c00(iVar9,*(uint *)(iVar6 + 0xc) >> 0x11 & 7);
              iVar9 = local_314 + iVar9;
              local_314 = iVar9;
            }
            iVar12 = iVar12 + 1;
            iVar6 = iVar6 + 0x10;
          } while (iVar12 < (int)(uint)*(ushort *)(DAT_00791598 + 0xa8));
        }
        uVar5 = FUN_004a6ed0(local_110,local_308,iVar9);
        FUN_004a07c0(uVar5,0);
      }
      uVar10 = uVar10 + 1;
      local_310 = local_310 + uVar8 * local_30c * 2;
      piVar3 = piVar3 + 3;
    } while ((int)uVar10 < in_ECX);
  }
  bVar2 = false;
LAB_004a5ff0:
  iVar6 = FUN_004a15f0();
  if ((iVar6 != 0) && (!bVar2)) {
    __security_check_cookie(local_c ^ (uint)&stack0xfffffffc);
    return;
  }
  __security_check_cookie(local_c ^ (uint)&stack0xfffffffc);
  return;
}

