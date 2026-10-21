
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0043b810(void)

{
  byte bVar1;
  undefined2 uVar2;
  int iVar3;
  int iVar4;
  undefined4 uVar5;
  undefined4 uVar6;
  undefined4 uVar7;
  undefined4 uVar8;
  uint uVar9;
  int in_ECX;
  uint uVar10;
  int iVar11;
  int extraout_EDX;
  int iVar12;
  uint uVar13;
  int iVar14;
  byte *pbVar15;
  int iVar16;
  byte *pbVar17;
  undefined4 *puVar18;
  bool bVar19;
  float fVar20;
  float fVar21;
  uint local_874;
  float *local_860;
  int *local_85c;
  int *local_858;
  byte *local_854 [4];
  int local_844 [395];
  int local_218 [132];
  uint local_8;
  
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  local_874 = 0;
  iVar12 = *(int *)(in_ECX + 0x10);
  iVar3 = *(int *)(iVar12 + 0x40);
  iVar4 = *(int *)(iVar12 + 0xc);
  local_854[0] = *(byte **)(in_ECX + 0x29d4);
  bVar19 = DAT_00621538 != 2;
  DAT_00626a2e = *(char *)(in_ECX + 0x29e2);
  DAT_00626a2f = *(char *)(in_ECX + 0x29e3);
  iVar11 = *(int *)(in_ECX + 0x2980);
  uVar5 = *(undefined4 *)(in_ECX + 0xac);
  uVar6 = *(undefined4 *)(in_ECX + 0xb0);
  uVar7 = *(undefined4 *)(in_ECX + 0xb4);
  uVar8 = *(undefined4 *)(in_ECX + 0xb8);
  _DAT_006961b0 = *(undefined4 *)(in_ECX + 0xbc);
  DAT_006961a0 = (short)uVar5;
  _DAT_006962e0 = (float)DAT_006961a0 * 0.00024414062;
  DAT_006961a2 = (short)((uint)uVar5 >> 0x10);
  _DAT_006962e4 = (float)DAT_006961a2 * 0.00024414062;
  DAT_006961a4 = (short)uVar6;
  _DAT_006962e8 = (float)DAT_006961a4 * 0.00024414062;
  DAT_006961a6 = (short)((uint)uVar6 >> 0x10);
  _DAT_006962f0 = (float)DAT_006961a6 * 0.00024414062;
  DAT_006961a8 = (short)uVar7;
  _DAT_006962f4 = (float)DAT_006961a8 * 0.00024414062;
  DAT_006961aa = (short)((uint)uVar7 >> 0x10);
  _DAT_006962f8 = (float)DAT_006961aa * 0.00024414062;
  DAT_006961ac = (short)uVar8;
  _DAT_00696300 = (float)DAT_006961ac * 0.00024414062;
  DAT_006961ae = (short)((uint)uVar8 >> 0x10);
  _DAT_00696304 = (float)DAT_006961ae * 0.00024414062;
  _DAT_00696308 = (float)DAT_006961b0 * 0.00024414062;
  DAT_006961b4 = (*(int *)(in_ECX + 0x2c) >> 0x14 & 0x7fU) - 0x40;
  DAT_006961b8 = 0;
  DAT_006961bc = (*(int *)(in_ECX + 0x34) >> 0x14 & 0x7fU) - 0x40;
  _DAT_006962d0 = (float)DAT_006961b4;
  _DAT_006962d4 = 0;
  _DAT_006962d8 = (float)DAT_006961bc;
  local_858 = local_218;
  local_854[1] = *(byte **)(iVar12 + 0x48);
  local_860 = (float *)(uint)*(ushort *)(iVar12 + 4);
  local_85c = local_844;
  do {
    _DAT_00696224 = *(undefined4 *)local_854[1];
    _DAT_00696228 = *(undefined4 *)((int)local_854[1] + 4);
    iVar12 = (int)(short)_DAT_00696228;
    iVar16 = (int)(short)((uint)_DAT_00696224 >> 0x10);
    iVar14 = (int)(short)_DAT_00696224;
    DAT_00696288 = DAT_006961a0 * iVar14 + DAT_006961a2 * iVar16 + DAT_006961a4 * iVar12 >> 0xc;
    DAT_0069628c = DAT_006961a6 * iVar14 + DAT_006961a8 * iVar16 + DAT_006961aa * iVar12 >> 0xc;
    *local_85c = DAT_0069628c;
    local_85c[-1] = DAT_00696288;
    DAT_00696290 = DAT_006961ac * iVar14 + DAT_006961ae * iVar16 + DAT_006961b0 * iVar12 >> 0xc;
    iVar14 = (-DAT_0069628c >> 4) + -1;
    local_85c[1] = DAT_00696290;
    iVar12 = 0;
    if (0 < iVar14) {
      iVar12 = iVar14;
    }
    local_854[1] = (byte *)((int)local_854[1] + 8);
    local_85c = local_85c + 3;
    *local_858 = iVar12;
    local_858 = local_858 + 1;
    local_860 = (float *)((int)local_860 + -1);
  } while (-1 < (int)local_860);
  local_854[2] = (byte *)(in_ECX + 0x2988);
  _DAT_006961a0 = uVar5;
  _DAT_006961a4 = uVar6;
  _DAT_006961a8 = uVar7;
  _DAT_006961ac = uVar8;
  if (local_854[2] < *(byte **)(in_ECX + 0x29d0)) {
    fVar20 = 1.5258789e-05;
    pbVar17 = (byte *)(iVar11 + 0x42);
    fVar21 = 0.5;
    do {
      uVar9 = *(uint *)(iVar4 + (uint)*local_854[2] * 8);
      uVar13 = uVar9 >> 8 & 0xff00 | (uVar9 & 0xff00) << 8 | uVar9 & 0xff0000ff;
      uVar2 = *(undefined2 *)pbVar17;
      pbVar15 = local_854[0];
      puVar18 = (undefined4 *)((int)pbVar17 + -0x42);
      for (iVar12 = 0x21; iVar12 != 0; iVar12 = iVar12 + -1) {
        *puVar18 = *(undefined4 *)pbVar15;
        pbVar15 = pbVar15 + 4;
        puVar18 = puVar18 + 1;
      }
      *(undefined2 *)pbVar17 = uVar2;
      if (bVar19) {
        local_85c = (int *)((int)pbVar17 + -0x22);
LAB_0043bc71:
        local_858 = (int *)0x4;
        local_854[1] = pbVar17;
        do {
          uVar10 = uVar13 & 0xff;
          uVar13 = uVar13 >> 8;
          if (uVar10 != 0) {
            if (bVar19) {
              _DAT_00696224 = *(undefined4 *)(iVar3 + -8 + uVar10 * 8);
              _DAT_00696228 = *(undefined4 *)(iVar3 + -4 + uVar10 * 8);
              FUN_004a4450();
              iVar11 = (DAT_00696288 >> 1) + 0x40 + ((int)local_854[uVar10 * 3] >> 10);
              iVar12 = ((int)local_854[uVar10 * 3 + 2] >> 10) + (DAT_00696290 >> 1) + 0x40;
              if (iVar11 < 0) {
                iVar11 = 0;
              }
              if (iVar12 < 0) {
                iVar12 = 0;
              }
              if (0x7f < iVar11) {
                iVar11 = 0x7f;
              }
              if (0x7f < iVar12) {
                iVar12 = 0x7f;
              }
              *(char *)local_85c = (char)iVar11 + DAT_00626a2e;
              *(char *)((int)local_85c + 1) = (char)iVar12 + DAT_00626a2f;
              local_85c = local_85c + 8;
            }
            else {
              _DAT_00696224 = *(undefined4 *)(iVar3 + -8 + uVar10 * 8);
              _DAT_00696228 = *(undefined4 *)(iVar3 + -4 + uVar10 * 8);
              FUN_004a4450();
              iVar12 = DAT_00696290 * 0x200;
              pbVar17 = local_854[extraout_EDX + 2];
              *local_860 = (float)(int)(local_854[extraout_EDX] + DAT_00696288 * 0x200) * fVar20 +
                           fVar21;
              local_860[1] = (float)(int)(pbVar17 + iVar12) * fVar20 + fVar21;
              local_860 = local_860 + 2;
            }
          }
          pbVar17 = local_854[1];
          local_858 = (int *)((int)local_858 + -1);
        } while (local_858 != (int *)0x0);
        if (bVar19) {
          FUN_00428550((undefined2 *)((int)local_854[1] + -0x3e));
          FUN_00428550((undefined2 *)((int)pbVar17 + -0x1e));
          FUN_00428550((undefined2 *)((int)pbVar17 + 2));
          if (0xffffff < uVar9) {
            FUN_00428550((undefined2 *)((int)pbVar17 + 0x22));
          }
          bVar1 = local_854[0][7];
          if (bVar1 == 0xc4) {
            *(undefined1 *)((int)pbVar17 + -0x3b) = 0x8e;
          }
          else if (bVar1 == 0xc0) {
            *(undefined1 *)((int)pbVar17 + -0x3b) = 0x9e;
          }
          else {
            *(byte *)((int)pbVar17 + -0x3b) = bVar1 | 2;
          }
          iVar12 = (int)ROUND(*(float *)((int)pbVar17 + -0x36)) >> 5;
          if (((iVar12 < 0x101) || (iVar12 = iVar12 / 2 + 0x80, iVar12 < 0x181)) ||
             (iVar12 = iVar12 / 2 + 0xc0, iVar12 < 0x200)) {
            if (iVar12 < 1) {
              iVar12 = 1;
            }
          }
          else {
            iVar12 = 0x1ff;
          }
          uVar9 = (&DAT_00790720)[iVar12];
          *(int *)((int)pbVar17 + -0x42) = *(int *)(uVar9 & 0x7fffffff);
          *(int *)(uVar9 & 0x7fffffff) = (int)((int)pbVar17 + -0x42);
        }
      }
      else if (0xbf < local_854[0][7]) {
        local_860 = (float *)(local_854[0] + 0x84);
        goto LAB_0043bc71;
      }
      if ((local_854[0][7] & 0xfc) == 0x9c) {
        iVar12 = 100;
      }
      else {
        iVar12 = 0xa4;
        if ((local_854[0][7] & 0xfc) == 0x8c) {
          iVar12 = 0x84;
        }
      }
      pbVar17 = (byte *)((int)pbVar17 + 0x84);
      local_874 = local_874 + 1;
      local_854[1] = pbVar17;
      if (0x3b < local_874) break;
      local_854[0] = local_854[0] + iVar12;
      local_854[2] = local_854[2] + 1;
    } while (local_854[2] < *(byte **)(in_ECX + 0x29d0));
  }
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

