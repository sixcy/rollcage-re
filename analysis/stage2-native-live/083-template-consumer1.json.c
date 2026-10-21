
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0043cdd0(int param_1,int param_2,int param_3,byte param_4)

{
  ushort *puVar1;
  int *piVar2;
  float fVar3;
  float fVar4;
  float fVar5;
  undefined8 uVar6;
  ushort uVar7;
  int iVar8;
  uint uVar9;
  uint uVar10;
  uint uVar11;
  bool bVar12;
  int iVar13;
  ushort *puVar14;
  short sVar15;
  uint uVar16;
  undefined4 *puVar17;
  uint *puVar18;
  uint uVar19;
  int iVar20;
  undefined4 *puVar21;
  undefined4 *puVar22;
  uint *puVar23;
  uint *puVar24;
  int in_EDX;
  uint *puVar25;
  int iVar26;
  uint uVar27;
  undefined4 *puVar28;
  uint *puVar29;
  bool bVar30;
  float10 fVar31;
  float fVar32;
  float fVar33;
  float fVar34;
  float fVar35;
  float fVar36;
  float fVar37;
  float local_8e0;
  float fStack_8dc;
  int local_8b4;
  uint *local_898;
  uint local_894;
  uint local_888;
  uint local_880;
  uint local_87c;
  uint local_878;
  int local_874;
  int local_86c;
  uint *local_868;
  uint local_864;
  uint local_860;
  uint *local_858;
  uint local_854;
  ushort *local_84c;
  undefined4 *local_848;
  float local_844;
  short local_83c;
  undefined1 local_838 [4];
  float local_834;
  float local_830;
  float local_82c;
  float local_828;
  float local_824;
  uint local_820 [491];
  ushort uStack_72;
  uint local_70 [23];
  uint local_14;
  
  iVar13 = DAT_0069641c;
  local_14 = DAT_005122ac ^ (uint)&stack0xfffffff0;
  local_87c = *(uint *)(in_EDX + 8);
  local_854 = local_87c + 1;
  iVar8 = *(int *)(DAT_00791598 + 4);
  local_848 = (undefined4 *)0x1;
  puVar17 = (undefined4 *)(*(int *)(in_EDX + 0x20) + param_1 * local_854 * 8);
  bVar12 = false;
  local_898 = (uint *)0x0;
  local_880 = 0;
  if (param_3 == 1) {
    local_86c = 0;
    if (0 < (int)local_854) {
      puVar18 = local_70;
      for (uVar19 = local_854 >> 1; uVar19 != 0; uVar19 = uVar19 - 1) {
        *puVar18 = 0x80008;
        puVar18 = puVar18 + 1;
      }
      for (uVar19 = (uint)((local_854 & 1) != 0); uVar19 != 0; uVar19 = uVar19 - 1) {
        *(undefined2 *)puVar18 = 8;
        puVar18 = (uint *)((int)puVar18 + 2);
      }
    }
    local_874 = *(int *)(in_EDX + 0x50) + param_1 * local_87c * 8;
    local_84c = *(ushort **)(in_EDX + 0x28);
  }
  else {
    local_86c = (local_854 * 8 << ((char)param_3 - 1U & 0x1f)) + local_854 * -8;
    puVar18 = *(uint **)(in_EDX + 0x20 + param_3 * 4);
    local_854 = *puVar18;
    local_87c = local_854 - 1;
    iVar26 = ((int)local_87c >> 1) + 1;
    if (iVar26 != 0) {
      puVar25 = local_70;
      for (; puVar18 = puVar18 + 1, iVar26 != 0; iVar26 = iVar26 + -1) {
        *puVar25 = *puVar18;
        puVar25 = puVar25 + 1;
      }
    }
    uVar19 = (param_1 >> ((char)param_3 - 1U & 0x1f)) * local_87c;
    local_874 = *(int *)(in_EDX + 0x4c + param_3 * 4) + uVar19 * 8;
    local_84c = *(ushort **)(in_EDX + 0x24 + param_3 * 4);
    piVar2 = (int *)(*(int *)(in_EDX + 0x34 + param_3 * 4) + (uVar19 >> 3) * 4);
    local_898 = (uint *)(piVar2 + 1);
    local_880 = *piVar2 >> (sbyte)((uVar19 & 7) << 2);
  }
  puVar14 = local_84c;
  puVar18 = local_820;
  puVar21 = puVar17;
  for (uVar19 = local_854; uVar19 != 0; uVar19 = uVar19 - 1) {
    _DAT_00696224 = *puVar21;
    _DAT_00696228 = puVar21[1];
    (*DAT_0069633c)(puVar18);
    puVar21 = (undefined4 *)((int)puVar21 + (uint)(&uStack_72)[uVar19]);
    puVar18 = puVar18 + 6;
    (*DAT_00696344)();
  }
  if ((param_4 & 1) != 0) {
    puVar18 = local_820;
    local_84c = local_84c + *local_84c + 1;
    puVar21 = puVar17;
    local_848 = puVar17;
    if (0 < (int)local_854) {
      local_860 = local_854;
      iVar26 = (int)local_70 + local_854 * 2;
      puVar25 = puVar18;
      do {
        puVar22 = local_848;
        if (local_848 <= puVar17) {
          local_848 = (undefined4 *)((int)local_848 + (uint)*local_84c);
          local_84c = local_84c + -1;
        }
        puVar1 = (ushort *)(iVar26 + -2);
        iVar26 = iVar26 + -2;
        puVar21 = (undefined4 *)((int)puVar17 + (uint)*puVar1);
        puVar18 = puVar25 + 6;
        if (puVar17 < puVar22) {
          puVar25[4] = (uint)(((float)puVar25[-2] + (float)puVar25[10]) * 0.5);
          puVar25[5] = (uint)(((float)puVar25[-1] + (float)puVar25[0xb]) * 0.5);
          puVar25[1] = (uint)(((float)puVar25[-5] + (float)puVar25[7]) * 0.5);
          FUN_004a6580();
          iVar20 = -0x10000;
          if ((float)puVar25[8] - (float)puVar25[-4] < 0.0) {
            iVar20 = 0x10000;
          }
          if (0.0 <= (float)puVar25[9] - (float)puVar25[-3]) {
            iVar20 = iVar20 + 1;
          }
          else {
            iVar20 = iVar20 + -1;
          }
          local_83c = (short)iVar20;
          sVar15 = local_83c;
          local_83c = (short)((uint)iVar20 >> 0x10);
          if (iVar13 == 0) {
            puVar25[2] = (uint)((float)sVar15 * 0.5 + (float)puVar25[2]);
            fVar32 = (float)local_83c * 0.5 + (float)puVar25[3];
          }
          else {
            puVar25[2] = (uint)((float)puVar25[2] - (float)sVar15 * 0.5);
            fVar32 = (float)puVar25[3] - (float)local_83c * 0.5;
          }
          puVar25[3] = (uint)fVar32;
        }
        local_860 = local_860 - 1;
        puVar17 = puVar21;
        puVar25 = puVar18;
      } while (local_860 != 0);
    }
  }
  if (0 < param_2) {
    local_8b4 = 8;
    uVar19 = local_854;
    uVar16 = -local_87c;
    uVar11 = local_854 + 1;
    do {
      local_878 = uVar11 & 0xffff;
      local_888 = uVar16 & 0xffff;
      local_894 = uVar19 & 0xffff;
      puVar21 = (undefined4 *)((int)puVar21 + local_86c);
      puVar17 = puVar21;
      puVar25 = puVar18;
      uVar16 = local_854;
      if (param_2 != 1) {
        puVar17 = local_848;
      }
      while (local_848 = puVar17, uVar16 != 0) {
        _DAT_00696224 = *puVar21;
        local_864 = puVar21[1];
        _DAT_00696228 = local_864;
        (*DAT_0069633c)(puVar25);
        local_864 = local_864 >> 0x10;
        uVar16 = uVar16 - 1;
        uVar27 = (uint)*(ushort *)((int)local_70 + uVar16 * 2);
        puVar21 = (undefined4 *)((int)puVar21 + uVar27);
        puVar17 = (undefined4 *)((uint)*(ushort *)(local_874 + -8) * 0xbc + iVar8);
        (*DAT_00696344)();
        if ((param_2 == 1) && ((param_4 & 2) != 0)) {
          if (!bVar12) {
            bVar12 = true;
            local_84c = puVar14 + *puVar14 + 1;
          }
          puVar22 = (undefined4 *)((int)puVar21 - uVar27);
          if (local_848 <= puVar22) {
            uVar7 = *local_84c;
            local_84c = local_84c + -1;
            puVar28 = (undefined4 *)((int)local_848 + (uint)uVar7);
            bVar30 = local_848 <= puVar22;
            local_848 = puVar28;
            if (bVar30) goto LAB_0043d4f1;
          }
          if (uVar16 != 0) {
            _DAT_00696224 = *puVar21;
            _DAT_00696228 = puVar21[1];
            (*DAT_0069633c)(local_838);
            fVar32 = (float)puVar25[-5];
            fVar34 = (float)puVar25[-4];
            fVar3 = (float)puVar25[-3];
            uVar6 = *(undefined8 *)(puVar25 + -2);
            (*DAT_00696344)();
            local_8e0 = (float)uVar6;
            puVar25[4] = (uint)((local_828 + local_8e0) * 0.5);
            fStack_8dc = (float)((ulonglong)uVar6 >> 0x20);
            puVar25[5] = (uint)((local_824 + fStack_8dc) * 0.5);
            puVar25[1] = (uint)((local_834 + fVar32) * 0.5);
            FUN_004a6580();
            iVar26 = -0x10000;
            if (fVar34 - local_830 < 0.0) {
              iVar26 = 0x10000;
            }
            if (0.0 <= fVar3 - local_82c) {
              iVar26 = iVar26 + 1;
            }
            else {
              iVar26 = iVar26 + -1;
            }
            local_83c = (short)iVar26;
            sVar15 = local_83c;
            local_83c = (short)((uint)iVar26 >> 0x10);
            if (iVar13 == 0) {
              puVar25[2] = (uint)((float)sVar15 * 0.5 + (float)puVar25[2]);
              puVar25[3] = (uint)((float)local_83c * 0.5 + (float)puVar25[3]);
            }
            else {
              puVar25[2] = (uint)((float)puVar25[2] - (float)sVar15 * 0.5);
              puVar25[3] = (uint)((float)puVar25[3] - (float)local_83c * 0.5);
            }
          }
        }
LAB_0043d4f1:
        fVar32 = 0.0;
        if (uVar16 != local_87c) {
          if (param_3 != 1) {
            uVar27 = (int)local_880 >> 4;
            local_864 = local_880 & 0xffff | 4;
            local_880 = uVar27;
            if (uVar27 == 0) {
              local_880 = *local_898;
              local_898 = local_898 + 1;
            }
          }
          local_858 = puVar25 + -6;
          puVar18 = puVar25 + (short)uVar11 * -6;
          puVar23 = puVar25 + (short)uVar19 * -6;
          if ((*puVar23 & *puVar18 & *local_858 & *puVar25) == 0) {
            puVar24 = puVar23;
            puVar29 = puVar18;
            local_868 = puVar25;
            if ((local_864 & 4) == 0) {
              puVar24 = puVar25;
              puVar29 = puVar23;
              local_868 = local_858;
              local_858 = puVar18;
            }
            if (((*puVar24 | *puVar29 | *local_858) & 0x10) == 0) {
              fVar31 = (float10)FUN_004a50a0(puVar29,puVar24,local_858);
              fVar34 = (float)fVar31;
              if (iVar13 != 0) {
                fVar34 = -fVar34;
              }
            }
            else {
              fVar34 = 1.0;
              *puVar29 = *puVar29 | 0x80;
            }
            uVar27 = 0x80000000;
            local_844 = (float)puVar25[1];
            fVar3 = (float)puVar25[-5];
            fVar4 = (float)puVar23[1];
            fVar5 = (float)puVar18[1];
            fVar35 = fVar3;
            fVar36 = fVar4;
            fVar37 = fVar5;
            if (((*puVar29 & 0x80) == 0) && ((*local_868 & 0x10) == 0)) {
              fVar31 = (float10)FUN_004a50a0(puVar24,local_868,local_858);
              fVar33 = (float)fVar31;
              if (iVar13 != 0) {
                fVar33 = (float)((uint)fVar33 ^ uVar27);
              }
            }
            else {
              *puVar24 = *puVar24 | 0x80;
              fVar33 = 1.0;
            }
            if (fVar34 <= fVar32) {
              puVar29 = puVar24;
              if (fVar33 <= fVar32) goto LAB_0043d8c8;
            }
            else if (fVar33 <= fVar32) {
              local_868 = local_858;
            }
            if ((int)local_844 < (int)fVar3) {
              local_844 = fVar35;
            }
            if ((int)local_844 < (int)fVar4) {
              local_844 = fVar36;
            }
            if ((int)local_844 < (int)fVar5) {
              local_844 = fVar37;
            }
            if (-1 < (int)ROUND(local_844)) {
              bVar30 = DAT_00621538 != 0;
              uVar27 = puVar29[1];
              uVar9 = puVar29[2];
              uVar10 = puVar29[3];
              puVar17[2] = *puVar29;
              puVar17[3] = uVar27;
              puVar17[4] = uVar9;
              puVar17[5] = uVar10;
              uVar7 = *(ushort *)((int)puVar17 + 0x42);
              *(undefined8 *)(puVar17 + 6) = *(undefined8 *)(puVar29 + 4);
              uVar27 = puVar24[1];
              uVar9 = puVar24[2];
              uVar10 = puVar24[3];
              puVar17[10] = *puVar24;
              puVar17[0xb] = uVar27;
              puVar17[0xc] = uVar9;
              puVar17[0xd] = uVar10;
              *(undefined8 *)(puVar17 + 0xe) = *(undefined8 *)(puVar24 + 4);
              uVar27 = local_858[1];
              uVar9 = local_858[2];
              uVar10 = local_858[3];
              puVar17[0x12] = *local_858;
              puVar17[0x13] = uVar27;
              puVar17[0x14] = uVar9;
              puVar17[0x15] = uVar10;
              *(undefined8 *)(puVar17 + 0x16) = *(undefined8 *)(local_858 + 4);
              uVar27 = local_868[1];
              uVar9 = local_868[2];
              uVar10 = local_868[3];
              puVar17[0x1a] = *local_868;
              puVar17[0x1b] = uVar27;
              puVar17[0x1c] = uVar9;
              puVar17[0x1d] = uVar10;
              uVar27 = local_868[5];
              puVar17[0x1e] = local_868[4];
              puVar17[0x1f] = uVar27;
              *(undefined1 *)((int)puVar17 + 7) = 0x8c;
              if ((((bVar30) && (param_3 == 1)) &&
                  ((float)puVar29[1] <= 1500.0 && (float)puVar29[1] != 1500.0)) &&
                 (((puVar29 != puVar24 && (puVar17[0x2d] != 0)) &&
                  (iVar26 = FUN_0049c7a0(), iVar26 != 0)))) {
                *(undefined1 *)((int)puVar17 + 7) = 0xc4;
              }
              if ((local_864 & 1) != 0) {
                uVar27 = puVar29[1];
                uVar9 = puVar29[2];
                uVar10 = puVar29[3];
                puVar17[0x31] = *puVar29;
                puVar17[0x32] = uVar27;
                puVar17[0x33] = uVar9;
                puVar17[0x34] = uVar10;
                *(undefined8 *)(puVar17 + 0x35) = *(undefined8 *)(puVar29 + 4);
                uVar27 = puVar24[1];
                uVar9 = puVar24[2];
                uVar10 = puVar24[3];
                puVar17[0x39] = *puVar24;
                puVar17[0x3a] = uVar27;
                puVar17[0x3b] = uVar9;
                puVar17[0x3c] = uVar10;
                *(undefined8 *)(puVar17 + 0x3d) = *(undefined8 *)(puVar24 + 4);
                uVar27 = local_858[1];
                uVar9 = local_858[2];
                uVar10 = local_858[3];
                puVar17[0x41] = *local_858;
                puVar17[0x42] = uVar27;
                puVar17[0x43] = uVar9;
                puVar17[0x44] = uVar10;
                *(undefined8 *)(puVar17 + 0x45) = *(undefined8 *)(local_858 + 4);
                uVar27 = local_868[1];
                uVar9 = local_868[2];
                uVar10 = local_868[3];
                puVar17[0x49] = *local_868;
                puVar17[0x4a] = uVar27;
                puVar17[0x4b] = uVar9;
                puVar17[0x4c] = uVar10;
                uVar27 = local_868[5];
                puVar17[0x4d] = local_868[4];
                puVar17[0x4e] = uVar27;
                *(undefined1 *)((int)puVar17 + 0xc3) = 0x8c;
                uVar27 = (&DAT_0078feb8)[(uVar7 & 0x7f) * 4];
                puVar17[0x2f] = *(undefined4 *)(uVar27 & 0x7fffffff);
                *(undefined4 *)(uVar27 & 0x7fffffff) = puVar17 + 0x2f;
              }
              iVar26 = 0;
              if (*(char *)((int)puVar17 + 7) == -0x3c) {
                iVar26 = local_8b4;
              }
              puVar22 = (undefined4 *)
                        (*(uint *)((int)&DAT_0078feb8 + (uVar7 & 0x7f) * 0x10 + iVar26) & 0x7fffffff
                        );
              *puVar17 = *puVar22;
              *puVar22 = puVar17;
            }
          }
        }
LAB_0043d8c8:
        local_874 = local_874 + 8;
        puVar17 = local_848;
        puVar25 = puVar25 + 6;
      }
      local_874 = local_874 + -8;
      uVar19 = -local_894;
      puVar18 = local_820;
      if (puVar25 < local_820 + (short)local_854 * 0xc) {
        puVar18 = puVar25;
      }
      param_2 = param_2 + -1;
      uVar16 = local_878;
      uVar11 = local_888;
    } while (0 < param_2);
  }
  __security_check_cookie(local_14 ^ (uint)&stack0xfffffff0);
  return;
}

