
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_0042f250(void)

{
  int iVar1;
  undefined1 uVar2;
  undefined1 uVar3;
  undefined1 uVar4;
  short sVar5;
  short sVar6;
  short sVar7;
  int iVar8;
  char cVar9;
  undefined2 uVar10;
  int *piVar11;
  void *pvVar12;
  int iVar13;
  int iVar14;
  uint *puVar15;
  undefined4 *puVar16;
  undefined4 uVar17;
  int iVar18;
  uint uVar19;
  undefined1 *puVar20;
  ushort *puVar21;
  ushort uVar22;
  int iVar23;
  int iVar24;
  byte bVar25;
  undefined1 *puVar26;
  ushort *puVar27;
  uint uVar28;
  size_t sVar29;
  short *psVar30;
  float fVar31;
  float fVar32;
  uint local_50;
  uint uStack_4c;
  uint local_48;
  int local_34;
  int local_30;
  int local_2c;
  short *local_28;
  uint *local_24;
  ushort *local_20;
  int local_1c;
  int local_18;
  int local_14;
  void *local_10;
  undefined1 *local_c;
  int local_8;
  
  local_24 = (uint *)0x0;
  local_8 = 0;
  uVar19 = (uint)((ulonglong)(*(ushort *)(PTR_DAT_00513210 + 0x2a6) - 0x95) * 0xaaaaaaab >> 0x20) &
           0xfffffffe;
  local_2c = uVar19 + 0x51;
  DAT_00791560 = FUN_00402bc0(uVar19 + 0x50,0);
  DAT_00791594 = DAT_00791560;
  FUN_00437700();
  puVar16 = DAT_006a4104;
  iVar18 = 0;
  uVar17 = *(undefined4 *)(DAT_00791594 + 0x54);
  cVar9 = (char)uVar17 * '\x02';
  DAT_0079158d = (byte)((uint)uVar17 >> 8);
  DAT_0079158e = (char)((uint)uVar17 >> 0x10);
  bVar25 = DAT_0079158d * '\x02';
  uVar22 = CONCAT11(DAT_0079158e * '\x02',cVar9);
  _DAT_0079158c = CONCAT11(bVar25,cVar9);
  uRam0079158f = (undefined1)((uint)uVar17 >> 0x18);
  _DAT_0079158c = CONCAT12(DAT_0079158e * '\x02',_DAT_0079158c);
  piVar11 = &DAT_004f0230;
  do {
    if (*piVar11 == (byte)PTR_DAT_00513210[0x2ac] + 1) {
      bVar25 = (&UNK_004f0238)[iVar18 * 0x18];
      uVar22 = CONCAT11((&UNK_004f023c)[iVar18 * 0x18],(&UNK_004f0234)[iVar18 * 0x18]);
      DAT_00696350 = (float)(*(int *)(&UNK_004f0240 + iVar18 * 0x18) << 4);
      _DAT_0079158c = CONCAT11(bVar25,(&UNK_004f0234)[iVar18 * 0x18]);
      _DAT_0079158c = CONCAT12((&UNK_004f023c)[iVar18 * 0x18],_DAT_0079158c);
      DAT_00696354 = (float)(*(int *)(&UNK_004f0244 + iVar18 * 0x18) << 4);
      _DAT_00696358 = (1.0 / ((DAT_00696354 - DAT_00696350) + 1.0)) * 255.0;
      break;
    }
    piVar11 = piVar11 + 6;
    iVar18 = iVar18 + 1;
  } while ((int)piVar11 < 0x4f0530);
  uVar19 = (uint)uVar22;
  uVar28 = ((uVar19 & 0xff) << 8 | (uint)bVar25) << 8 | (uint)(uVar22 >> 8);
  _DAT_00696b28 = uVar28;
  if (DAT_006a4104[0x385] != uVar28) {
    (**(code **)(*(int *)*DAT_006a4104 + 0x50))((int *)*DAT_006a4104,0x22,uVar28);
    puVar16[0x385] = uVar28;
    uVar19 = (uint)CONCAT11(DAT_0079158e,DAT_0079158c);
    bVar25 = DAT_0079158d;
  }
  DAT_0069634c = ((uVar19 >> 8 & 0xfe) << 8 | bVar25 & 0xfffffffe) << 7 | (uVar19 & 0xff) >> 1;
  local_c = *(undefined1 **)(DAT_00791594 + 8);
  sVar29 = (int)local_c * 0xbc;
  local_10 = malloc(sVar29);
  if (local_10 != (void *)0x0) {
    memset(local_10,0,sVar29);
  }
  if (DAT_0060e2dc == (void *)0x0) {
    pvVar12 = malloc(0x60ae0);
    if (pvVar12 != (void *)0x0) {
      memset(pvVar12,0,0x60ae0);
    }
    _DAT_00791564 = (int)pvVar12 + 0x60a5c;
    DAT_0060e2dc = pvVar12;
    _DAT_0079155c = pvVar12;
    DAT_00791568 = _DAT_00791564;
  }
  iVar18 = DAT_00791594;
  iVar23 = 0;
  iVar13 = *(int *)(DAT_00791594 + 0x88) + DAT_00791560;
  local_34 = *(int *)(DAT_00791594 + 0x8c) + DAT_00791560;
  local_20 = (ushort *)(*(int *)(DAT_00791594 + 0x98) + DAT_00791560);
  if (*(char *)(DAT_00791594 + 0x79) != '\0') {
    piVar11 = (int *)(local_34 + 8);
    do {
      *piVar11 = *piVar11 + (int)local_20;
      piVar11 = piVar11 + 3;
      iVar23 = iVar23 + 1;
    } while (iVar23 < (int)(uint)*(byte *)(iVar18 + 0x79));
  }
  iVar23 = DAT_00791560;
  iVar24 = 0;
  *(int *)(iVar18 + 0x4c) = *(int *)(iVar18 + 0x4c) + DAT_00791560;
  iVar14 = *(int *)(iVar18 + 0x1c) + iVar23;
  *(int *)(iVar18 + 0x24) = *(int *)(iVar18 + 0x24) + iVar23;
  *(int *)(iVar18 + 0x14) = *(int *)(iVar18 + 0x14) + iVar23;
  *(int *)(iVar18 + 0x7c) = *(int *)(iVar18 + 0x7c) + iVar23;
  *(int *)(iVar18 + 0x80) = *(int *)(iVar18 + 0x80) + iVar23;
  *(int *)(iVar18 + 0x18) = *(int *)(iVar18 + 0x18) + iVar23;
  *(int *)(iVar18 + 0x34) = *(int *)(iVar18 + 0x34) + iVar23;
  *(int *)(iVar18 + 0x40) = *(int *)(iVar18 + 0x40) + iVar23;
  *(int *)(iVar18 + 0x3c) = *(int *)(iVar18 + 0x3c) + iVar23;
  *(int *)(iVar18 + 0x20) = *(int *)(iVar18 + 0x20) + iVar23;
  DAT_0079156c = *(undefined4 *)(iVar18 + 0x4c);
  local_18 = *(int *)(iVar18 + 0x24);
  DAT_00791598 = &DAT_00768d60;
  DAT_00768d74 = local_18;
  if (*(short *)(iVar18 + 0x66) != 0) {
    do {
      fVar31 = (float)*(byte *)(*(int *)(iVar18 + 0x4c) + iVar24 * 4);
      fVar31 = (fVar31 + fVar31) * _DAT_0069635c;
      fVar32 = 255.0;
      if (255.0 <= fVar31) {
        fVar31 = fVar32;
      }
      *(char *)(*(int *)(iVar18 + 0x4c) + iVar24 * 4) = (char)(int)fVar31;
      fVar31 = (float)*(byte *)(*(int *)(iVar18 + 0x4c) + 1 + iVar24 * 4);
      fVar31 = (fVar31 + fVar31) * _DAT_0069635c;
      if (255.0 <= fVar31) {
        fVar31 = fVar32;
      }
      *(char *)(*(int *)(iVar18 + 0x4c) + 1 + iVar24 * 4) = (char)(int)fVar31;
      fVar31 = (float)*(byte *)(*(int *)(iVar18 + 0x4c) + 2 + iVar24 * 4);
      fVar31 = (fVar31 + fVar31) * _DAT_0069635c;
      if (255.0 <= fVar31) {
        fVar31 = fVar32;
      }
      *(char *)(*(int *)(iVar18 + 0x4c) + 2 + iVar24 * 4) = (char)(int)fVar31;
      iVar24 = iVar24 + 1;
    } while (iVar24 < (int)(uint)*(ushort *)(iVar18 + 0x66));
  }
  iVar24 = 0;
  *(int *)(iVar18 + 0x6c) = *(int *)(iVar18 + 0x6c) + iVar23;
  local_30 = *(int *)(iVar18 + 0x68) + iVar23;
  *(int *)(iVar18 + 0x70) = *(int *)(iVar18 + 0x70) + iVar23;
  *(int *)(iVar18 + 0xa8) = *(int *)(iVar18 + 0xa8) + iVar23;
  *(int *)(iVar18 + 0xa4) = *(int *)(iVar18 + 0xa4) + iVar23;
  *(int *)(iVar18 + 0x9c) = *(int *)(iVar18 + 0x9c) + iVar23;
  *(int *)(iVar18 + 0x44) = *(int *)(iVar18 + 0x44) + iVar23;
  *(int *)(iVar18 + 0x74) = *(int *)(iVar18 + 0x74) + iVar23;
  *(int *)(iVar18 + 0xf0) = *(int *)(iVar18 + 0xf0) + iVar23;
  *(int *)(iVar18 + 0xe4) = *(int *)(iVar18 + 0xe4) + iVar23;
  *(int *)(iVar18 + 0xf8) = *(int *)(iVar18 + 0xf8) + iVar23;
  *(int *)(iVar18 + 0x100) = *(int *)(iVar18 + 0x100) + iVar23;
  *(int *)(iVar18 + 0x118) = *(int *)(iVar18 + 0x118) + iVar23;
  *(int *)(iVar18 + 0xd4) = *(int *)(iVar18 + 0xd4) + iVar23;
  *(int *)(iVar18 + 0x90) = *(int *)(iVar18 + 0x90) + iVar23;
  *(int *)(iVar18 + 0xc0) = *(int *)(iVar18 + 0xc0) + iVar23;
  *(int *)(iVar18 + 0xec) = *(int *)(iVar18 + 0xec) + iVar23;
  *(int *)(iVar18 + 0x108) = *(int *)(iVar18 + 0x108) + iVar23;
  *(int *)(iVar18 + 0x10c) = *(int *)(iVar18 + 0x10c) + iVar23;
  *(int *)(iVar18 + 0x130) = *(int *)(iVar18 + 0x130) + iVar23;
  *(int *)(iVar18 + 0x124) = *(int *)(iVar18 + 0x124) + iVar23;
  *(int *)(iVar18 + 300) = *(int *)(iVar18 + 300) + iVar23;
  *(int *)(iVar18 + 0x104) = *(int *)(iVar18 + 0x104) + iVar23;
  *(int *)(iVar18 + 0x120) = *(int *)(iVar18 + 0x120) + iVar23;
  *(int *)(iVar18 + 0xd0) = *(int *)(iVar18 + 0xd0) + iVar23;
  local_28 = (short *)(*(int *)(iVar18 + 0xc4) + iVar23);
  if (*(short *)(iVar18 + 0x2c) != 0) {
    do {
      iVar8 = *(int *)(*(int *)(iVar18 + 0x18) + iVar24 * 4);
      if (iVar8 != 0) {
        *(int *)(*(int *)(iVar18 + 0x18) + iVar24 * 4) = iVar8 + iVar23;
        iVar8 = *(int *)(*(int *)(iVar18 + 0x18) + iVar24 * 4);
        *(int *)(iVar8 + 0x18) = *(int *)(iVar8 + 0x18) + iVar8;
        *(int *)(iVar8 + 0xc) = *(int *)(iVar8 + 0xc) + iVar8;
        *(int *)(iVar8 + 0x40) = *(int *)(iVar8 + 0x40) + iVar8;
        if (*(int *)(iVar8 + 0x44) != 0) {
          *(int *)(iVar8 + 0x44) = *(int *)(iVar8 + 0x44) + iVar8;
        }
        if (*(ushort *)(iVar8 + 0x1c) != 0) {
          iVar1 = iVar8 + (uint)*(ushort *)(iVar8 + 0x1c);
          *(int *)(iVar1 + 0x18) = *(int *)(iVar1 + 0x18) + iVar1;
          *(int *)(iVar1 + 0xc) = *(int *)(iVar1 + 0xc) + iVar1;
          if (*(int *)(iVar1 + 0x44) != 0) {
            *(int *)(iVar1 + 0x44) = *(int *)(iVar1 + 0x44) + iVar1;
          }
        }
        if (*(ushort *)(iVar8 + 0x1e) != 0) {
          iVar8 = iVar8 + (uint)*(ushort *)(iVar8 + 0x1e);
          *(int *)(iVar8 + 0x18) = *(int *)(iVar8 + 0x18) + iVar8;
          *(int *)(iVar8 + 0xc) = *(int *)(iVar8 + 0xc) + iVar8;
          if (*(int *)(iVar8 + 0x44) != 0) {
            *(int *)(iVar8 + 0x44) = *(int *)(iVar8 + 0x44) + iVar8;
          }
        }
      }
      iVar24 = iVar24 + 1;
    } while (iVar24 < (int)(uint)*(ushort *)(iVar18 + 0x2c));
  }
  uVar19 = (uint)*(ushort *)(iVar18 + 0x2c);
  if (uVar19 < uVar19 + 5) {
    do {
      piVar11 = (int *)(*(int *)(iVar18 + 0x18) + uVar19 * 4);
      *piVar11 = *piVar11 + iVar23;
      uVar19 = uVar19 + 1;
    } while ((int)uVar19 < (int)(*(ushort *)(iVar18 + 0x2c) + 5));
  }
  local_14 = *(int *)(iVar18 + 0x14);
  DAT_00768e08 = 0;
  local_1c = 0;
  if (0 < *(int *)(iVar18 + 0x10)) {
    do {
      piVar11 = (int *)(local_14 + local_1c * 4);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x50);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x54);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x28);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x3c);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x58);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x2c);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x40);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x5c);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x30);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x44);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x20);
      *piVar11 = *piVar11 + iVar23;
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x48);
      *piVar11 = *piVar11 + *(int *)(iVar18 + 0x3c);
      piVar11 = (int *)(*(int *)(local_14 + local_1c * 4) + 0x38);
      *piVar11 = *piVar11 + *(int *)(iVar18 + 0x50) + iVar23;
      iVar23 = *(int *)(local_14 + local_1c * 4);
      *(int *)(iVar23 + 0x4c) = (int)local_28 + *(int *)(iVar23 + 0x4c) * 0x1c;
      iVar23 = *(int *)(*(int *)(iVar18 + 0x14) + local_1c * 4);
      iVar23 = *(int *)(iVar23 + 0xc) * *(int *)(iVar23 + 8);
      if (iVar23 != 0) {
        piVar11 = (int *)(*(int *)(*(int *)(local_14 + local_1c * 4) + 0x50) + 4);
        uVar22 = DAT_00768e08;
        do {
          iVar23 = iVar23 + -1;
          if ((uint)uVar22 < *piVar11 + 1U) {
            uVar22 = (short)*piVar11 + 1;
            DAT_00768e08 = uVar22;
          }
          piVar11 = piVar11 + 2;
        } while (iVar23 != 0);
      }
      local_1c = local_1c + 1;
      iVar23 = DAT_00791560;
    } while (local_1c < *(int *)(iVar18 + 0x10));
  }
  iVar24 = 0x100;
  piVar11 = (int *)(local_18 + 0xc);
  do {
    if (((char)piVar11[-3] != -1) || (*(char *)((int)piVar11 + -0xb) != '\0')) {
      *piVar11 = *(int *)(iVar18 + 0x6c) + *piVar11 * 2 + -2;
    }
    piVar11 = piVar11 + 4;
    iVar24 = iVar24 + -1;
  } while (iVar24 != 0);
  *(int *)(iVar18 + 0x28) = *(int *)(iVar18 + 0x28) + iVar23;
  if (0 < (int)local_c) {
    puVar16 = (undefined4 *)((int)local_10 + 4);
    puVar20 = local_c;
    do {
      *puVar16 = 0x8cffffff;
      *(undefined2 *)(puVar16 + 8) = 0xffff;
      *(undefined1 *)((int)puVar16 + 0x22) = 0xff;
      *(undefined2 *)(puVar16 + 0x10) = 0xffff;
      *(undefined1 *)((int)puVar16 + 0x42) = 0xff;
      *(undefined2 *)(puVar16 + 0x18) = 0xffff;
      *(undefined1 *)((int)puVar16 + 0x62) = 0xff;
      puVar20 = puVar20 + -1;
      puVar16 = puVar16 + 0x2f;
    } while (puVar20 != (undefined1 *)0x0);
  }
  *(int *)(iVar18 + 0x60) = *(int *)(iVar18 + 0x60) + iVar23;
  *(int *)(iVar18 + 0x84) = *(int *)(iVar18 + 0x84) + iVar23;
  FUN_00414110();
  FUN_004141e0();
  pvVar12 = (void *)FUN_00402bc0(local_2c,0);
  iVar24 = DAT_00791594;
  iVar18 = *(int *)((int)pvVar12 + 0x28);
  DAT_00791570 = *(undefined4 *)((int)pvVar12 + 0x10);
  puVar20 = (undefined1 *)(*(int *)(DAT_00791594 + 0x110) + DAT_00791560);
  iVar23 = *(int *)((int)pvVar12 + 0x38);
  local_1c = *(int *)((int)pvVar12 + 0x3c) + (int)pvVar12;
  DAT_00791590 = puVar20;
  if (0 < (int)local_c) {
    local_2c = 0x7fff;
    puVar21 = (ushort *)((int)local_10 + 0x82);
    puVar26 = local_c;
    psVar30 = (short *)((int)pvVar12 + 0x40);
    do {
      puVar21[-0x20] = *(ushort *)(puVar20 + 6);
      *puVar21 = *psVar30 - 1U & 0x1f;
      puVar21[-0x30] = *(ushort *)(puVar20 + 2) & 0x7fff;
      *(undefined1 *)(puVar21 + -0x31) = *puVar20;
      *(undefined1 *)((int)puVar21 + -0x61) = puVar20[1];
      *(undefined1 *)(puVar21 + -0x21) = puVar20[4];
      *(undefined1 *)((int)puVar21 + -0x41) = puVar20[5];
      *(undefined1 *)(puVar21 + -0x11) = puVar20[8];
      *(undefined1 *)((int)puVar21 + -0x21) = puVar20[9];
      *(undefined1 *)(puVar21 + -1) = puVar20[10];
      *(undefined1 *)((int)puVar21 + -1) = puVar20[0xb];
      puVar26 = puVar26 + -1;
      puVar21 = puVar21 + 0x5e;
      psVar30 = psVar30 + 1;
    } while (puVar26 != (undefined1 *)0x0);
  }
  iVar8 = DAT_00791560;
  local_28 = pvVar12;
  FUN_004142f0();
  local_18 = *(int *)((int)pvVar12 + 0x14);
  DAT_00768d64 = local_10;
  DAT_00768d60 = local_14;
  _DAT_00768d68 = iVar24;
  DAT_00768da5 = *(undefined1 *)(iVar24 + 4);
  DAT_00768d6c = *(undefined4 *)(iVar24 + 0x20);
  DAT_00768d70 = *(undefined4 *)(iVar24 + 0x10);
  _DAT_00768d78 = *(undefined4 *)(iVar24 + 0x18);
  DAT_00768d7c = *(undefined4 *)(iVar24 + 0x34);
  _DAT_00768d80 = *(undefined4 *)(iVar24 + 0x38);
  DAT_00768d84 = *(undefined4 *)(iVar24 + 0x40);
  DAT_00768d88 = *(undefined4 *)(iVar24 + 0x48);
  _DAT_00768dac = *(undefined4 *)(iVar24 + 0x70);
  DAT_00768da7 = *(undefined1 *)(iVar24 + 0x78);
  DAT_00768d8c = *(undefined4 *)(iVar24 + 0x44);
  DAT_00768da8 = *(undefined4 *)(iVar24 + 0x74);
  DAT_00768d90 = *(undefined4 *)(iVar24 + 0x4c);
  DAT_00768db0 = *(undefined4 *)(iVar24 + 0x7c);
  DAT_00768db4 = *(undefined4 *)(iVar24 + 0x80);
  _DAT_00768db8 = *(undefined4 *)(iVar24 + 0x84);
  DAT_00768d98 = local_30;
  _DAT_00768d9c = *(undefined4 *)(iVar24 + 0x6c);
  DAT_00768dbc = *(undefined2 *)(iVar24 + 0x66);
  _DAT_00768dbe = *(undefined2 *)(iVar24 + 0x7a);
  DAT_00768dc0 = local_34;
  _DAT_00768dc4 = local_20;
  _DAT_00768df4 = *(undefined4 *)(iVar24 + 0xc0);
  DAT_00768da6 = *(undefined1 *)(iVar24 + 0x79);
  DAT_00768d96 = *(undefined1 *)(iVar24 + 0x94);
  DAT_00768dc8 = *(undefined4 *)(iVar24 + 0x90);
  _DAT_00768dd8 = *(undefined4 *)(iVar24 + 0xa8);
  DAT_00768dcc = *(undefined4 *)(iVar24 + 0x9c);
  DAT_00768dd4 = *(undefined4 *)(iVar24 + 0xa4);
  DAT_00768da4 = *(undefined1 *)(iVar24 + 0x95);
  DAT_00768dd0 = *(int *)(iVar24 + 0xa0) + iVar8;
  _DAT_00768df0 = *(int *)(iVar24 + 0xbc) + iVar8;
  DAT_00768ddc = *(int *)(iVar24 + 0xac) + iVar8;
  DAT_00768de0 = *(undefined4 *)(iVar24 + 0x28);
  DAT_00768de4 = *(int *)(iVar24 + 0xb0) + iVar8;
  DAT_00768dec = *(int *)(iVar24 + 0xb8) + iVar8;
  DAT_00768de8 = (uint)*(byte *)(iVar24 + 0xb4);
  DAT_00768dfc = *(int *)(iVar24 + 0xd8) + iVar8;
  DAT_00768da0 = *(int *)(iVar24 + 0xcc) + iVar8;
  iVar23 = FUN_004a5d20(*(undefined1 *)((int)pvVar12 + 0x33),iVar23 + (int)pvVar12,local_1c,
                        *(int *)((int)pvVar12 + 0x24) + (int)pvVar12,0);
  if ((iVar23 != 0) && (iVar23 = FUN_00430350(), iVar23 != 0)) {
    iVar23 = 0;
    do {
      FUN_00430440();
      iVar23 = iVar23 + 1;
    } while (iVar23 < 5);
    sVar29 = local_18 * 4;
    local_10 = malloc(sVar29);
    if (local_10 != (void *)0x0) {
      memset(local_10,0,sVar29);
    }
    DAT_00791300 = 0;
    local_1c = 0;
    if (0 < local_18) {
      puVar20 = (undefined1 *)((int)pvVar12 + iVar18 + 0x26);
      do {
        iVar18 = local_1c;
        local_c = puVar20;
        switch(*(ushort *)(puVar20 + -0x26) & 0x3ff) {
        case 0:
          puVar15 = (uint *)FUN_00437780(0x198);
          *(undefined1 *)((int)puVar15 + 0x14d) = *puVar20;
          *(byte *)((int)puVar15 + 0x186) = puVar20[-0xf] & 1;
          *(undefined2 *)(puVar15 + 0x61) = *(undefined2 *)(puVar20 + 2);
          puVar15[0x59] = (uint)*(ushort *)(puVar20 + -6) + iVar14;
          puVar15[0x5a] = (uint)*(ushort *)(puVar20 + -4) + iVar14;
          puVar15[0x5b] = (uint)*(ushort *)(puVar20 + -2) + iVar14;
          puVar15[99] = 3;
          puVar15[100] = 3;
          *(undefined1 *)((int)puVar15 + 0x18a) = puVar20[-10];
          *(undefined1 *)((int)puVar15 + 0x18b) = puVar20[-9];
          *(undefined2 *)(puVar15 + 0x5c) = *(undefined2 *)(puVar20 + -0xc);
          *(undefined2 *)((int)puVar15 + 0x172) = *(undefined2 *)(puVar20 + -0xe);
          *(char *)((int)puVar15 + 0x17d) = (char)(*(short *)(puVar20 + -0x16) >> 4);
          *(undefined2 *)(puVar15 + 0x5d) = *(undefined2 *)(puVar20 + -0x20);
          *(undefined1 *)((int)puVar15 + 0x17e) = puVar20[-7];
          if (*(short *)(puVar20 + -0x20) == -1) {
            *(undefined1 *)(puVar15 + 0x5f) = 0;
          }
          else {
            puVar15[0x65] = 0;
            if (puVar20[-0x10] == '\0') {
              puVar15[0x60] = 0;
            }
            else {
              puVar15[0x60] = (uint)local_24;
              *(undefined1 *)(local_24 + 0x5f) = 0;
              local_24[0x65] = (uint)puVar15;
            }
            *(undefined1 *)(puVar15 + 0x5f) =
                 *(undefined1 *)
                  (*(int *)(DAT_00791594 + 0x80) + 7 + (uint)*(ushort *)(puVar20 + -0x20) * 0x10);
            local_24 = puVar15;
          }
          *(short *)((int)puVar15 + 0x176) = (short)iVar18;
          *(uint **)((int)local_10 + iVar18 * 4) = puVar15;
          puVar15[0x5e] = iVar13 + (uint)*(ushort *)(puVar20 + -0x12) * 4;
          memset(puVar15 + 0xb,0,200);
          sVar6 = *(short *)(puVar20 + -0x14);
          sVar7 = *(short *)(puVar20 + -0x18);
          sVar5 = *(short *)(puVar20 + -0x16);
          puVar15[0x15] = 0;
          puVar15[0x16] = 0;
          puVar15[0x17] = 0;
          if (sVar7 != 0) {
            uVar19 = FUN_00445360();
            puVar15[0x15] = uVar19;
          }
          if (sVar5 != 0) {
            uVar19 = FUN_00445360();
            puVar15[0x16] = uVar19;
          }
          if (sVar6 != 0) {
            uVar19 = FUN_00445360();
            puVar15[0x17] = uVar19;
          }
          uVar19 = FUN_004452b0();
          puVar15[0x14] = uVar19;
          FUN_00444fd0();
          local_20 = (ushort *)((int)puVar15 + 0x14e);
          puVar15[0xb] = (int)*(short *)(puVar20 + -0x1e) << 0x10;
          puVar15[0xc] = (int)*(short *)(puVar20 + -0x1c) << 0x10;
          uVar19 = 0;
          puVar15[0xd] = (int)*(short *)(puVar20 + -0x1a) << 0x10;
          puVar21 = (ushort *)(puVar20 + 8);
          do {
            uVar22 = *puVar21;
            *local_20 = uVar22;
            if (uVar22 >> 0xc == 2) {
              FUN_00432b20(&local_8);
            }
            uVar19 = uVar19 + 1;
            local_20 = local_20 + 1;
            puVar21 = puVar21 + 1;
          } while (uVar19 < 10);
          uVar19 = FUN_0041ea60(puVar15[0xd],&local_34);
          puVar20 = local_c;
          iVar18 = DAT_00790f38;
          if (local_34 != 0) {
            uVar19 = uVar19 + 1;
          }
          puVar15[3] = uVar19;
          uVar22 = *(ushort *)((uVar19 & 0xfffffffe) + 8);
          uVar10 = (undefined2)((uint)((int)puVar15 + (0x80 - iVar18)) >> 7);
          if (uVar22 == 0) {
            puVar15[1] = 0;
          }
          else {
            puVar15[1] = (uint)uVar22;
            *(undefined2 *)((uint)uVar22 * 0x80 + -0x7a + iVar18) = uVar10;
          }
          *(undefined2 *)((uVar19 & 0xfffffffe) + 8) = uVar10;
          iVar18 = DAT_0079db80;
          if (*(char *)((int)puVar15 + 0x17e) == '\x02') {
            uVar2 = local_c[-0x22];
            uVar3 = local_c[-0x21];
            uVar4 = local_c[-0x24];
            *(char *)((int)puVar15 + 0x17f) = (char)DAT_0079db80;
            iVar23 = iVar18 * 0x10;
            DAT_0079db80 = DAT_0079db80 + 1;
            (&DAT_0079d860)[iVar18 * 8] = *(undefined2 *)((int)puVar15 + 0x2e);
            (&DAT_0079d862)[iVar18 * 8] = *(undefined2 *)((int)puVar15 + 0x32);
            (&DAT_0079d864)[iVar18 * 8] = *(undefined2 *)((int)puVar15 + 0x36);
            (&DAT_0079d867)[iVar23] = uVar3;
            (&DAT_0079d866)[iVar23] = uVar2;
            (&DAT_0079d868)[iVar23] = uVar4;
            *(uint **)(&DAT_0079d86c + iVar23) = puVar15;
            (&DAT_0079d869)[iVar23] = 0;
          }
          else if (*(char *)((int)puVar15 + 0x17e) == '\x16') {
            iVar18 = DAT_00791300 * 8;
            iVar23 = DAT_00791300 * 2;
            DAT_00791300 = DAT_00791300 + 1;
            (&DAT_00791280)[iVar23] = puVar15;
            uVar19 = DAT_005131f4 * 0x41a7 & 0x7fffffff;
            DAT_005131f4 = uVar19;
            (&DAT_00791284)[iVar18] = (char)(uVar19 >> 0x10);
            (&DAT_00791285)[iVar18] = ((byte)(uVar19 >> 0x18) & 1) + 1;
            *puVar15 = *puVar15 | 0x100000;
          }
          FUN_00491db0();
          if (*(char *)((int)puVar15 + 0x17e) == '\0') {
            (&DAT_00836fe0)[DAT_0060e204 * 3] = puVar15;
            DAT_0060e204 = DAT_0060e204 + 1;
          }
          break;
        case 2:
          local_30 = CONCAT31(local_30._1_3_,puVar20[-0x21]);
          local_2c = CONCAT31(local_2c._1_3_,puVar20[-0x22]);
          puVar16 = (undefined4 *)
                    FUN_00441180(*(undefined2 *)(puVar20 + -0x1a),*(undefined2 *)(puVar20 + -0x20),
                                 local_2c,local_30);
          iVar18 = DAT_0060e2fc;
          *puVar16 = 2;
          if (iVar18 < 0x28) {
            (&DAT_0076a440)[iVar18 * 3] = (int)*(short *)(puVar16 + 4) << 0x10;
            (&DAT_0076a444)[iVar18 * 3] = (int)*(short *)((int)puVar16 + 0x12) << 0x10;
            DAT_0060e2fc = DAT_0060e2fc + 1;
            (&DAT_0076a448)[iVar18 * 3] = (int)*(short *)(puVar16 + 5) << 0x10;
          }
          break;
        case 0xd:
          FUN_00441020(*(undefined2 *)(puVar20 + -0x1a),*(undefined2 *)(puVar20 + -0x20),
                       puVar20[-0x22],puVar20[-10],puVar20[-9],puVar20[-8],local_8);
          local_8 = local_8 + 1;
          break;
        case 0x18:
          iVar18 = FUN_004465f0();
          if (iVar18 != 0) {
            uVar19 = 0;
            puVar21 = (ushort *)(iVar18 + 0x14e);
            puVar27 = (ushort *)(puVar20 + 8);
            do {
              uVar22 = *puVar27;
              *puVar21 = uVar22;
              if (uVar22 >> 0xc == 2) {
                FUN_00432b20(&local_8);
              }
              uVar19 = uVar19 + 1;
              puVar27 = puVar27 + 1;
              puVar21 = puVar21 + 1;
            } while (uVar19 < 10);
            if (local_c[-10] != '\0') {
              (&DAT_006261d8)[DAT_0060e200 * 2] = iVar18;
              *(uint *)(&DAT_006261dc + DAT_0060e200 * 8) = (uint)(byte)local_c[-10];
              DAT_0060e200 = DAT_0060e200 + 1;
            }
            puVar20 = local_c;
            if (local_c[-9] != '\0') {
              (&DAT_006261d8)[DAT_0060e200 * 2] = iVar18;
              *(uint *)(&DAT_006261dc + DAT_0060e200 * 8) = (uint)(byte)local_c[-9];
              DAT_0060e200 = DAT_0060e200 + 1;
            }
          }
        }
        puVar20 = puVar20 + 0x42;
        local_1c = local_1c + 1;
        local_c = puVar20;
      } while (local_1c < local_18);
    }
    iVar18 = DAT_00791594;
    iVar23 = 0;
    iVar13 = DAT_00768ddc;
    if (*(short *)(DAT_00791594 + 0x96) != 0) {
      do {
        uVar19 = *(uint *)(iVar13 + iVar23 * 4);
        if (uVar19 < 0x10000) {
          *(undefined4 *)(iVar13 + iVar23 * 4) = *(undefined4 *)((int)local_10 + uVar19 * 4);
          iVar13 = DAT_00768ddc;
        }
        iVar23 = iVar23 + 1;
      } while (iVar23 < (int)(uint)*(ushort *)(iVar18 + 0x96));
    }
    iVar13 = 0;
    if (*(char *)(iVar18 + 0x12a) != '\0') {
      do {
        iVar23 = *(int *)(iVar18 + 0x130);
        iVar14 = *(int *)(iVar23 + 4 + iVar13 * 8);
        if (iVar14 == -1) {
          *(undefined4 *)(iVar23 + 4 + iVar13 * 8) = 0;
        }
        else {
          *(undefined4 *)(iVar23 + 4 + iVar13 * 8) = *(undefined4 *)((int)local_10 + iVar14 * 4);
        }
        iVar13 = iVar13 + 1;
      } while (iVar13 < (int)(uint)*(byte *)(iVar18 + 0x12a));
    }
    free(local_10);
    free(local_28);
    pvVar12 = DAT_00791588;
    if (DAT_00791580 != 0) {
      _DAT_00791584 = *(int *)(DAT_00791594 + 8);
      sVar29 = _DAT_00791584 << 5;
      pvVar12 = malloc(sVar29);
      if (pvVar12 != (void *)0x0) {
        memset(pvVar12,0,sVar29);
      }
    }
    DAT_00791588 = pvVar12;
    iVar18 = 0;
    local_24 = (uint *)0x0;
    DAT_0060e2b0 = 0;
    local_28 = *(short **)(DAT_00791594 + 0xf0);
    if (*(char *)(DAT_00791594 + 0xb6) != '\0') {
      piVar11 = &DAT_0079cc90;
      do {
        if ((*(byte *)(local_28 + 3) != 1) && (iVar18 < 0x28)) {
          piVar11[-4] = (uint)*(byte *)(local_28 + 3);
          piVar11[-3] = (int)*local_28 << 0x10;
          piVar11[-2] = (int)local_28[1] << 0x10;
          piVar11[-1] = (int)local_28[2] << 0x10;
          *piVar11 = (int)local_28[4] << 0x10;
          sVar6 = local_28[5];
          piVar11[1] = sVar6 * 0x10000;
          sVar7 = local_28[6];
          piVar11[2] = sVar7 * 0x10000;
          if (piVar11[-4] == 2) {
            iVar13 = *piVar11 - piVar11[-3];
            iVar23 = sVar6 * 0x10000 - piVar11[-2];
            iVar18 = sVar7 * 0x10000 - piVar11[-1];
            local_50 = iVar13 >> 8;
            uStack_4c = iVar23 >> 8;
            local_48 = iVar18 >> 8;
            if (((0x230000 < (int)((local_50 ^ iVar13 >> 0x1f) - (iVar13 >> 0x1f))) ||
                (0x230000 < (int)((uStack_4c ^ iVar23 >> 0x1f) - (iVar23 >> 0x1f)))) ||
               (0x230000 < (int)((local_48 ^ iVar18 >> 0x1f) - (iVar18 >> 0x1f)))) {
              local_50 = iVar13 >> 0xb;
              uStack_4c = iVar23 >> 0xb;
              local_48 = iVar18 >> 0xb;
            }
            iVar18 = FUN_00445500();
            if (iVar18 == 0) {
              local_50 = 0x10000;
              local_48 = 0;
              uStack_4c = 0;
            }
            else {
              FUN_00445490();
            }
            *(ulonglong *)(piVar11 + 3) = CONCAT44(uStack_4c,local_50);
            piVar11[5] = local_48;
            iVar18 = DAT_0060e2b0;
          }
          iVar18 = iVar18 + 1;
          piVar11 = piVar11 + 0xb;
          DAT_0060e2b0 = iVar18;
        }
        local_24 = (uint *)((int)local_24 + 1);
        local_28 = local_28 + 8;
      } while ((int)local_24 < (int)(uint)*(byte *)(DAT_00791594 + 0xb6));
    }
    FUN_00419e80();
    if ((*(int *)(DAT_00791594 + 0x10) != 0) && (DAT_00621538 != 0)) {
      sVar29 = *(int *)(DAT_00791594 + 0x10) * 4;
      pvVar12 = malloc(sVar29);
      if (pvVar12 != (void *)0x0) {
        memset(pvVar12,0,sVar29);
      }
      iVar18 = 0;
      DAT_00768e04 = pvVar12;
      if (0 < *(int *)(DAT_00791594 + 0x10)) {
        do {
          uVar17 = FUN_0049c3d0();
          *(undefined4 *)((int)DAT_00768e04 + iVar18 * 4) = uVar17;
          iVar18 = iVar18 + 1;
        } while (iVar18 < *(int *)(DAT_00791594 + 0x10));
      }
    }
    return 1;
  }
  return 0;
}

