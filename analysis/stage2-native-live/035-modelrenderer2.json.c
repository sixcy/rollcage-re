
/* WARNING: Function: __alloca_probe replaced with injection: alloca_probe */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00433b40(void)

{
  uint *puVar1;
  float fVar2;
  short sVar3;
  undefined4 uVar4;
  uint uVar5;
  uint uVar6;
  int iVar7;
  int iVar8;
  undefined4 *puVar9;
  byte bVar10;
  ushort uVar11;
  int iVar12;
  int iVar13;
  uint uVar14;
  short *psVar15;
  uint *in_ECX;
  uint uVar16;
  undefined4 *puVar17;
  byte extraout_DL;
  ushort uVar18;
  int in_EDX;
  uint *puVar19;
  float fVar20;
  undefined4 *puVar21;
  uint *puVar22;
  float10 fVar23;
  undefined8 uVar24;
  ushort *local_1c7c;
  ushort *local_1c78;
  ushort *local_1c74;
  uint local_1c70;
  undefined4 local_1c6c;
  undefined4 local_1c68;
  byte local_1c64;
  uint *local_1c60;
  uint local_1c5c;
  undefined1 *local_1c54;
  uint local_1c50;
  uint local_1c4c;
  uint *local_1c48;
  uint *local_1c44;
  uint *local_1c40;
  float local_1c3c;
  undefined1 local_1c38 [7204];
  uint local_14;
  
  iVar7 = DAT_0069641c;
  local_14 = DAT_005122ac ^ (uint)&stack0xfffffff0;
  local_1c70 = 0xffff;
  local_1c78 = (ushort *)0xffffffff;
  iVar12 = FUN_00444880();
  puVar9 = DAT_00791558;
  iVar8 = DAT_00768dfc;
  uVar16 = in_ECX[4];
  local_1c48 = (uint *)in_ECX[7];
  bVar10 = *(byte *)(uVar16 + 0x36) >> 5;
  local_1c50 = bVar10 & 1;
  local_1c74 = (ushort *)0x0;
  if (((bVar10 & 1) == 0) && (DAT_00696adc * 10000 >> 8 < in_EDX)) {
    if (DAT_00696adc * 25000 >> 8 < in_EDX) {
      uVar11 = *(ushort *)(uVar16 + 0x1e);
      local_1c40 = (uint *)0x2;
      if (uVar11 == 0) {
        uVar11 = *(ushort *)(uVar16 + 0x1c);
      }
      local_1c60 = (uint *)in_ECX[10];
      uVar16 = uVar16 + uVar11;
      local_1c3c = (float)(uint)*(byte *)((int)in_ECX + 0x147);
    }
    else {
      local_1c60 = (uint *)in_ECX[9];
      uVar16 = uVar16 + *(ushort *)(uVar16 + 0x1c);
      local_1c3c = (float)(uint)*(byte *)((int)in_ECX + 0x146);
      local_1c40 = (uint *)0x1;
    }
  }
  else {
    local_1c60 = (uint *)in_ECX[8];
    local_1c3c = (float)(uint)*(byte *)((int)in_ECX + 0xf5);
    local_1c40 = (uint *)0x0;
  }
  if ((bVar10 & 1) == 0) {
    local_1c74 = (ushort *)(*(int *)(uVar16 + 0x10) + uVar16);
    puVar17 = DAT_00791574;
  }
  else {
    puVar17 = (undefined4 *)in_ECX[5];
  }
  if ((*in_ECX & 0x800) == 0) {
    local_1c70 = 0;
    local_1c78 = (ushort *)in_ECX[(int)local_1c40 + 0x59];
  }
  local_1c7c = (ushort *)(DAT_00768da0 + (uint)*(ushort *)(uVar16 + 0x3c) * 2);
  local_1c5c = (uint)(ushort)in_ECX[2];
  local_1c54 = local_1c38;
  _DAT_00696224 = *local_1c48;
  _DAT_00696228 = local_1c48[1];
  (*DAT_0069633c)(local_1c38);
  local_1c48 = local_1c48 + 2;
  local_1c40 = (uint *)0x0;
  local_1c44 = (uint *)(uint)((*in_ECX & 0x100000) != 0);
  bVar10 = 1;
  if ((*in_ECX & 0x100000) != 0) {
    iVar13 = 0;
    bVar10 = 1;
    do {
      if (DAT_00791280 == in_ECX) {
        local_1c40 = (uint *)(int)(char)_DAT_00791284;
        bVar10 = (byte)((uint)_DAT_00791284 >> 8);
        iVar13 = DAT_00791300;
      }
      iVar13 = iVar13 + 1;
    } while (iVar13 < DAT_00791300);
  }
  if (local_1c3c != 0.0) {
    do {
      local_1c68 = local_1c48[1];
      uVar16 = *local_1c48;
      local_1c6c = uVar16;
      if (local_1c44 == (uint *)0x1) {
        local_1c6c._2_2_ = (short)(uVar16 >> 0x10);
        local_1c4c = local_1c68;
        iVar13 = FUN_0048ed10();
        sVar3 = (&DAT_00513260)
                [(iVar13 << (extraout_DL & 0x1f)) + (int)local_1c40 + local_1c6c._2_2_ * 2 & 0xff];
        local_1c6c._0_2_ = (short)uVar16;
        uVar24 = FUN_0048ed10();
        uVar16 = local_1c68 >> 0x10;
        local_1c68 = CONCAT22((short)uVar16,
                              (short)local_1c68 +
                              *(char *)((int)&DAT_00513260 +
                                       (((int)uVar24 << (bVar10 & 0x1f)) + (int)local_1c40 +
                                        local_1c6c._2_2_ * 4 & 0xffU) * 2 + 1));
        local_1c6c = CONCAT22(local_1c6c._2_2_ +
                              ((short)(&DAT_005132e0)[(int)((ulonglong)uVar24 >> 0x20)] >> 10),
                              (short)local_1c6c + (sVar3 >> 10));
      }
      puVar19 = local_1c48;
      local_1c4c = local_1c68;
      (*DAT_00696344)();
      local_1c54 = local_1c54 + 0x18;
      _DAT_00696228 = local_1c4c;
      _DAT_00696224 = local_1c6c;
      (*DAT_0069633c)(local_1c54);
      local_1c48 = puVar19 + 2;
      local_1c3c = (float)((int)local_1c3c - 1);
    } while (0 < (int)local_1c3c);
  }
  (*DAT_00696344)();
  uVar16 = 0x80000000;
  local_1c40 = &local_1c50;
  do {
    if (local_1c50 == 0) {
      uVar11 = *local_1c74;
      local_1c74 = local_1c74 + 1;
    }
    else {
      uVar11 = *(ushort *)((int)puVar17 + 0x82);
    }
    local_1c4c = (uint)uVar11;
    puVar21 = puVar17;
    do {
      local_1c70 = local_1c70 - 1;
      if ((int)local_1c70 < 1) {
        uVar11 = *local_1c78;
        local_1c78 = local_1c78 + 1;
        local_1c70 = uVar11 & 0xff;
        uVar14 = *(uint *)(iVar12 + (uint)(uVar11 >> 8) * 4);
        DAT_006961d4 = (uVar14 & 0xff) << 4 | 0xf;
        DAT_006961d8 = (uVar14 & 0xff00 | 0xf0) >> 4;
        DAT_006961dc = (uVar14 & 0xff0000 | 0xf000) >> 0xc;
        _DAT_006963c8 = (float)DAT_006961d4;
        _DAT_006963cc = (float)DAT_006961d8;
        _DAT_006963d0 = (float)DAT_006961dc;
      }
      uVar14 = *local_1c60;
      puVar19 = local_1c60 + 2;
      if (uVar14 == 0) {
        local_1c4c = local_1c4c - 8;
      }
      else {
        local_1c3c = (float)(uVar14 >> 0x18);
        local_1c48 = local_1c40 + (uVar14 & 0xff) * 6;
        local_1c44 = local_1c40 + (uVar14 >> 8 & 0xff) * 6;
        puVar1 = local_1c40 + (uVar14 >> 0x10 & 0xff) * 6;
        if (((*puVar1 | *local_1c48 | *local_1c44) & 0x10) == 0) {
          fVar23 = (float10)FUN_004a50a0(local_1c48,local_1c44,puVar1);
          local_1c54 = (undefined1 *)(float)fVar23;
          fVar20 = local_1c3c;
          if (iVar7 != 0) {
            local_1c54 = (undefined1 *)((uint)local_1c54 ^ uVar16);
          }
        }
        else {
          local_1c54 = (undefined1 *)0xbdcccccd;
          *local_1c44 = *local_1c44 | 0x80;
          fVar20 = (float)(uVar14 >> 0x18);
        }
        local_1c4c = local_1c4c - 8;
        if (((local_1c5c & 1) == 0) && (((uint)local_1c54 & 0x80000000) != 0)) {
          puVar22 = puVar1;
          if (fVar20 != 0.0) {
            puVar22 = local_1c40 + (int)fVar20 * 6;
          }
          if ((*puVar1 & *local_1c44 & *local_1c48 & *puVar22 & 0x3f) == 0) {
            _DAT_0069623c = 0xffffffff;
            uVar16 = local_1c60[1];
            uVar14 = uVar16 >> 0x1e & 2;
            if ((uVar16 & 0x40000000) == 0) {
              _DAT_00696228 = -((int)(uVar16 << 0x16) >> 0x12);
              _DAT_00696224 =
                   -((int)((uVar16 & 0xffffffc0) << 0xc) >> 2) |
                   -((int)(uVar16 * 4) >> 0x12) & 0xffffU;
              (*DAT_006963d4)();
            }
            else {
              DAT_0069627c = 0xffffffff;
            }
            if ((local_1c50 == 0) && (puVar17 = puVar21, puVar9 <= puVar21)) goto LAB_00434381;
            uVar16 = local_1c48[1];
            uVar5 = local_1c48[2];
            uVar6 = local_1c48[3];
            puVar21[2] = *local_1c48;
            puVar21[3] = uVar16;
            puVar21[4] = uVar5;
            puVar21[5] = uVar6;
            *(undefined8 *)(puVar21 + 6) = *(undefined8 *)(local_1c48 + 4);
            uVar16 = puVar1[1];
            uVar5 = puVar1[2];
            uVar6 = puVar1[3];
            puVar21[10] = *puVar1;
            puVar21[0xb] = uVar16;
            puVar21[0xc] = uVar5;
            puVar21[0xd] = uVar6;
            *(undefined8 *)(puVar21 + 0xe) = *(undefined8 *)(puVar1 + 4);
            uVar16 = local_1c44[1];
            uVar5 = local_1c44[2];
            uVar6 = local_1c44[3];
            puVar21[0x12] = *local_1c44;
            puVar21[0x13] = uVar16;
            puVar21[0x14] = uVar5;
            puVar21[0x15] = uVar6;
            *(undefined8 *)(puVar21 + 0x16) = *(undefined8 *)(local_1c44 + 4);
            if (local_1c50 == 0) {
              uVar18 = 0;
              puVar17 = (undefined4 *)((uint)*local_1c7c + iVar8);
              uVar11 = *(ushort *)((int)puVar17 + 2);
              if (uVar11 != 0xffff) {
                uVar16 = (uint)*(ushort *)(DAT_00768de4 + 6 + (uVar11 & 0xff) * 0x18);
                psVar15 = (short *)(DAT_00768dec + uVar16 * 6);
                if (*(short *)(DAT_00768dec + 4 + uVar16 * 6) == 0) {
                  psVar15 = (short *)(DAT_00768dec + *psVar15 * 6);
                }
                uVar18 = uVar11 >> 8;
                puVar17 = (undefined4 *)(*psVar15 * 0x10 + DAT_00791590);
              }
              puVar21[8] = *puVar17;
              puVar21[0x10] = puVar17[1];
              uVar4 = puVar17[2];
              *(short *)(puVar21 + 0x18) = (short)uVar4;
              *(short *)(puVar21 + 0x20) = (short)((uint)uVar4 >> 0x10);
              if (uVar18 != 0) {
                FUN_00433a10();
              }
            }
            fVar20 = local_1c3c;
            uVar4 = DAT_0069627c;
            bVar10 = 0x9c;
            puVar21[1] = DAT_0069627c;
            puVar21[9] = uVar4;
            puVar21[0x11] = uVar4;
            if (local_1c3c != 0.0) {
              uVar16 = puVar22[1];
              uVar5 = puVar22[2];
              uVar6 = puVar22[3];
              bVar10 = 0x8c;
              puVar21[0x1a] = *puVar22;
              puVar21[0x1b] = uVar16;
              puVar21[0x1c] = uVar5;
              puVar21[0x1d] = uVar6;
              *(undefined8 *)(puVar21 + 0x1e) = *(undefined8 *)(puVar22 + 4);
              puVar21[0x19] = uVar4;
            }
            *(undefined2 *)((int)puVar21 + 0x22) = 0xff;
            local_1c64 = (byte)uVar14;
            *(byte *)((int)puVar21 + 7) = local_1c64 | bVar10;
            local_1c3c = (float)local_1c44[1];
            if ((float)local_1c44[1] <= (float)local_1c48[1]) {
              local_1c3c = (float)local_1c48[1];
            }
            fVar2 = (float)puVar1[1];
            if (local_1c3c <= fVar2) {
              local_1c3c = fVar2;
            }
            if ((fVar20 != 0.0) && (local_1c3c <= (float)puVar22[1])) {
              local_1c3c = (float)puVar22[1];
            }
            iVar13 = (int)ROUND(local_1c3c) >> 5;
            if (((iVar13 < 0x101) || (iVar13 = iVar13 / 2 + 0x80, iVar13 < 0x181)) ||
               (iVar13 = iVar13 / 2 + 0xc0, iVar13 < 0x200)) {
              if (iVar13 < 1) {
                iVar13 = 1;
              }
            }
            else {
              iVar13 = 0x1ff;
            }
            if (uVar14 == 0) {
              uVar14 = (&DAT_0078feb8)[(*(ushort *)((int)puVar21 + 0x42) & 0x7f) * 4];
            }
            else {
              uVar14 = (&DAT_00790720)[iVar13];
            }
            uVar16 = 0x80000000;
            *puVar21 = *(undefined4 *)(uVar14 & 0x7fffffff);
            *(undefined4 *)(uVar14 & 0x7fffffff) = puVar21;
            if (local_1c50 == 0) {
              puVar21 = puVar21 + 0x21;
            }
          }
        }
      }
      puVar17 = puVar21 + 0x21;
      if (local_1c50 == 0) {
        puVar17 = puVar21;
      }
      local_1c7c = local_1c7c + 1;
      puVar21 = puVar17;
      local_1c60 = puVar19;
    } while (0 < (int)local_1c4c);
    if ((local_1c4c & 2) != 0) {
      local_1c5c = local_1c5c >> 1;
    }
  } while ((local_1c4c & 4) == 0);
LAB_00434381:
  if (local_1c50 == 0) {
    DAT_00791574 = puVar17;
  }
  __security_check_cookie(local_14 ^ (uint)&stack0xfffffff0);
  return;
}

