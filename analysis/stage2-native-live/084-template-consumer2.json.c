
void FUN_0043e490(void)

{
  short sVar1;
  short sVar2;
  ushort uVar3;
  ushort uVar4;
  ushort uVar5;
  uint uVar6;
  int iVar7;
  int *in_ECX;
  ushort uVar8;
  int *in_EDX;
  ushort *puVar9;
  uint uVar10;
  uint *puVar11;
  int iVar12;
  uint uVar13;
  int iVar14;
  int *piVar15;
  int iVar16;
  short *psVar17;
  ushort *puVar18;
  undefined4 *local_344;
  int local_340;
  ushort *local_338;
  int local_334;
  uint local_330;
  short local_328 [198];
  undefined4 local_19c;
  ushort local_198 [200];
  uint local_8;
  
  iVar7 = DAT_00768d64;
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  local_338 = (ushort *)*in_EDX;
  iVar14 = *in_ECX;
  if (iVar14 != 0) {
    psVar17 = (short *)((int)(in_ECX + 1) + ((int)&local_19c - (int)in_ECX));
    iVar12 = iVar14;
    piVar15 = in_ECX + 1;
    do {
      sVar1 = *(short *)((int)piVar15 + 6);
      sVar2 = *(short *)((int)piVar15 + 2);
      psVar17[-2] = (short)*piVar15;
      iVar16 = piVar15[1];
      psVar17[-1] = sVar1;
      *psVar17 = sVar2;
      psVar17[1] = ((short)iVar16 << ((char)sVar1 - 1U & 0x1f)) + sVar2;
      psVar17 = psVar17 + 4;
      iVar12 = iVar12 + -1;
      piVar15 = piVar15 + 2;
    } while (iVar12 != 0);
  }
  if (local_338 != (ushort *)0x0) {
    psVar17 = (short *)((int)(in_EDX + 1) + (int)local_328 + (-4 - (int)in_EDX));
    iVar12 = (int)local_338;
    piVar15 = in_EDX + 1;
    do {
      sVar1 = *(short *)((int)piVar15 + 6);
      sVar2 = *(short *)((int)piVar15 + 2);
      psVar17[-2] = (short)*piVar15;
      iVar16 = piVar15[1];
      psVar17[-1] = sVar1;
      *psVar17 = sVar2;
      psVar17[1] = ((short)iVar16 << ((char)sVar1 - 1U & 0x1f)) + sVar2;
      psVar17 = psVar17 + 4;
      iVar12 = iVar12 + -1;
      piVar15 = piVar15 + 2;
    } while (iVar12 != 0);
  }
  local_344 = &local_19c + iVar14 * 2;
  local_340 = iVar14;
  if (local_338 != (ushort *)0x0) {
    puVar9 = (ushort *)(local_328 + 1);
    do {
      uVar3 = puVar9[-1];
      iVar12 = *(int *)(puVar9 + -3);
      uVar4 = *puVar9;
      if (iVar14 != 0) {
        puVar18 = local_198 + 1;
        iVar16 = iVar14;
        do {
          if (*(int *)(puVar18 + -3) == iVar12) {
            uVar8 = puVar18[-1];
            uVar5 = *puVar18;
            if (((uVar8 != uVar5) && (uVar8 < uVar4)) && (uVar3 < uVar5)) {
              if (uVar8 < uVar3) {
                uVar8 = uVar3;
                if (uVar4 < uVar5) {
                  iVar16 = iVar16 + 1;
                  local_340 = local_340 + 1;
                  *local_344 = *(undefined4 *)(puVar18 + -3);
                  *(ushort *)(local_344 + 1) = uVar4;
                  *(ushort *)((int)local_344 + 6) = *puVar18;
                  local_344 = local_344 + 2;
                }
              }
              else if (uVar4 < uVar5) {
                puVar18[-1] = uVar4;
                goto LAB_0043e61a;
              }
              *puVar18 = uVar8;
            }
          }
LAB_0043e61a:
          puVar18 = puVar18 + 4;
          iVar16 = iVar16 + -1;
          iVar14 = local_340;
        } while (iVar16 != 0);
      }
      puVar9 = puVar9 + 4;
      local_338 = (ushort *)((int)local_338 + -1);
    } while (local_338 != (ushort *)0x0);
  }
  iVar12 = 0;
  DAT_00772b60 = 0;
  if (iVar14 != 0) {
    puVar18 = &DAT_00772b66;
    puVar9 = local_198;
    local_338 = &DAT_00772b66;
    do {
      uVar3 = puVar9[1];
      uVar4 = *puVar9;
      if (uVar3 != uVar4) {
        DAT_00772b60 = iVar12 + 1;
        uVar8 = puVar9[-2];
        uVar5 = puVar9[-1];
        uVar10 = (uint)uVar5;
        puVar18[-1] = uVar8;
        puVar18[2] = uVar5;
        uVar13 = (uint)uVar3 - (uint)uVar4 >> ((char)uVar5 - 1U & 0x1f);
        *local_338 = uVar4;
        local_338[1] = (ushort)uVar13;
        iVar12 = (uint)uVar8 * 4;
        iVar14 = 0;
        iVar16 = *(int *)(iVar12 + DAT_00768d60);
        if (uVar10 == 1) {
          local_334 = *(int *)(iVar16 + 0x50);
          iVar16 = *(int *)(iVar16 + 8);
          if (DAT_00621538 != 0) {
            iVar14 = **(int **)(iVar12 + DAT_00768e04) + iVar16 * (uint)uVar4 * 0x28;
          }
        }
        else {
          local_334 = *(int *)(iVar16 + 0x4c + uVar10 * 4);
          iVar16 = **(ushort **)(iVar16 + 0x20 + uVar10 * 4) - 1;
        }
        iVar12 = iVar16 * uVar13;
        puVar18 = (ushort *)(local_334 + (uint)(uVar4 >> ((char)uVar5 - 1U & 0x1f)) * iVar16 * 8);
        local_334 = iVar12;
        if (0 < iVar12) {
          do {
            if (uVar10 == 1) {
              puVar11 = (uint *)(*(int *)(puVar18 + 2) * 0x10 + DAT_00791590);
            }
            else {
              puVar11 = (uint *)(*(int *)(puVar18 + 2) + DAT_00791594);
            }
            local_330 = *puVar11;
            iVar12 = iVar7 + (uint)*puVar18 * 0xbc;
            if (0x7fffffff < local_330) {
              uVar13 = (uint)(uVar10 == 1);
              *(uint *)(iVar12 + 0xdc) = puVar11[uVar13 + 3];
              local_330 = local_330 & 0x7fffffff;
              *(uint *)(iVar12 + 0xfc) = puVar11[uVar13 + 4];
              *(short *)(iVar12 + 0x11c) = (short)puVar11[uVar13 + 5];
              *(undefined2 *)(iVar12 + 0x13c) = *(undefined2 *)((int)puVar11 + uVar13 * 4 + 0x16);
              *(undefined4 *)(iVar12 + 0xc0) = 0x8cffffff;
              *(undefined4 *)(iVar12 + 0xe0) = 0xffffff;
              *(undefined4 *)(iVar12 + 0x100) = 0xffffff;
              *(undefined4 *)(iVar12 + 0x120) = 0xffffff;
            }
            uVar13 = puVar11[2];
            uVar6 = puVar11[1];
            *(short *)(iVar12 + 0x60) = (short)uVar13;
            *(uint *)(iVar12 + 0x20) = local_330;
            *(uint *)(iVar12 + 0x40) = uVar6;
            *(short *)(iVar12 + 0x80) = (short)(uVar13 >> 0x10);
            if (iVar14 != 0) {
              iVar16 = 0;
              if (*(int *)(iVar14 + 0x1c) != 0) {
                iVar16 = iVar14;
              }
              iVar14 = iVar14 + 0x28;
              *(int *)(iVar12 + 0xb4) = iVar16;
            }
            puVar18 = puVar18 + 4;
            local_334 = local_334 + -1;
          } while (local_334 != 0);
        }
        puVar18 = local_338 + 4;
        iVar12 = DAT_00772b60;
        iVar14 = local_340;
        local_338 = puVar18;
      }
      iVar14 = iVar14 + -1;
      puVar9 = puVar9 + 4;
      local_340 = iVar14;
    } while (iVar14 != 0);
  }
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

