
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00413be0(void)

{
  short sVar1;
  short sVar2;
  short sVar3;
  undefined4 uVar4;
  void *pvVar5;
  undefined2 *puVar6;
  void *_Dst;
  int iVar7;
  uint uVar8;
  char cVar9;
  uint *extraout_ECX;
  uint *extraout_ECX_00;
  undefined4 *puVar10;
  uint *extraout_ECX_01;
  uint *puVar11;
  short *psVar12;
  uint uVar13;
  uint uVar14;
  uint uVar15;
  char *pcVar16;
  int iVar17;
  uint local_c;
  
  if (DAT_0079dba0 != 1) {
    if (DAT_0079dba0 == 2) {
      _DAT_0079dbb4 = 0x80;
      puVar6 = malloc(0x400);
      if (puVar6 != (undefined2 *)0x0) {
        memset(puVar6,0,0x400);
      }
      DAT_0079dbb8 = puVar6;
      pvVar5 = malloc(0x3c00);
      if (pvVar5 != (void *)0x0) {
        memset(pvVar5,0,0x3c00);
      }
      DAT_0079dbbc = pvVar5;
      pvVar5 = malloc(0xc00);
      if (pvVar5 != (void *)0x0) {
        memset(pvVar5,0,0xc00);
      }
      iVar7 = 0x100;
      pcVar16 = (char *)((int)DAT_0079dbbc + 6);
      DAT_0079dbc0 = pvVar5;
      do {
        DAT_005131f4 = DAT_005131f4 * 0x41a7 & 0x7fffffff;
        uVar8 = DAT_005131f4 >> 0x10 & 0x1ff;
        uVar13 = 0x7f;
        if (uVar8 < 0x7f) {
          uVar13 = uVar8;
        }
        iVar17 = uVar8 - 0x80;
        cVar9 = (char)uVar13 + '@';
        *pcVar16 = cVar9;
        pcVar16[-1] = cVar9;
        pcVar16[-2] = cVar9;
        if (0 < iVar17) {
          cVar9 = '?';
          if (iVar17 < 0x3f) {
            cVar9 = (char)iVar17;
          }
          iVar17 = uVar8 - 0xc0;
          pcVar16[-2] = pcVar16[-2] + cVar9;
          if (0 < iVar17) {
            cVar9 = '?';
            if (iVar17 < 0x3f) {
              cVar9 = (char)iVar17;
            }
            iVar17 = uVar8 - 0x100;
            pcVar16[-1] = pcVar16[-1] + cVar9;
            if (0 < iVar17) {
              cVar9 = '?';
              if (iVar17 < 0x3f) {
                cVar9 = (char)iVar17;
              }
              *pcVar16 = *pcVar16 + cVar9;
              if (0 < (int)(uVar8 - 0x196)) {
                pcVar16[-2] = pcVar16[-2] - (char)(uVar8 - 0x196);
              }
            }
          }
        }
        pcVar16[0x1a] = '\0';
        pcVar16[0x1b] = '\0';
        pcVar16[0x1c] = '\0';
        pcVar16[1] = -0x52;
        pcVar16 = pcVar16 + 0x3c;
        iVar7 = iVar7 + -1;
      } while (iVar7 != 0);
      local_c = 0;
      puVar6 = DAT_0079dbb8;
      do {
        uVar8 = DAT_005131f4 * 0x41a7 & 0x7fffffff;
        uVar13 = uVar8 >> 0x10 & 0xff;
        sVar1 = (&DAT_00513260)[uVar13];
        DAT_005131f4 = uVar8 * 0x41a7 & 0x7fffffff;
        uVar8 = DAT_005131f4 >> 0x10 & 0xff;
        sVar2 = (&DAT_005132e0)[uVar8];
        sVar3 = (&DAT_00513260)[uVar8];
        *puVar6 = (&DAT_005132e0)[uVar13];
        puVar6[1] = (short)((ulonglong)((longlong)((int)sVar2 << 2) * (longlong)(int)sVar1) >> 0x10)
        ;
        puVar6[2] = (short)((ulonglong)((longlong)((int)sVar3 << 2) * (longlong)(int)sVar1) >> 0x10)
        ;
        *(undefined4 *)(local_c + (int)DAT_0079dbc0) = 0xffffffff;
        local_c = local_c + 0x18;
        puVar6 = puVar6 + 4;
      } while (local_c < 0xc00);
      goto LAB_004140d1;
    }
    if (DAT_0079dba0 != 3) {
      return;
    }
  }
  if (DAT_0079dba0 == 1) {
    pvVar5 = malloc(0x1e00);
    _Dst = DAT_0079dbf4;
    if (pvVar5 != (void *)0x0) {
      memset(pvVar5,0,0x1e00);
      _Dst = DAT_0079dbf4;
    }
  }
  else {
    pvVar5 = DAT_0079dbe8;
    _Dst = DAT_0079dbf4;
    if ((DAT_0079dba0 == 3) && (_Dst = malloc(0x1d00), pvVar5 = DAT_0079dbe8, _Dst != (void *)0x0))
    {
      memset(_Dst,0,0x1d00);
      pvVar5 = DAT_0079dbe8;
    }
  }
  DAT_0079dbf4 = _Dst;
  DAT_0079dbe8 = pvVar5;
  pvVar5 = malloc(0x1800);
  puVar11 = extraout_ECX;
  if (pvVar5 != (void *)0x0) {
    memset(pvVar5,0,0x1800);
    puVar11 = extraout_ECX_00;
  }
  DAT_0079dc2c = pvVar5;
  if (DAT_0079dba0 == 1) {
    DAT_0079dbec = DAT_0079dbe8;
    DAT_0079dbf0 = (int)DAT_0079dbe8 + 0x1e00;
    puVar10 = (undefined4 *)((int)DAT_0079dbe8 + 4);
    iVar7 = 0x40;
    do {
      iVar17 = iVar7;
      *puVar10 = 0x98ffffff;
      puVar10 = puVar10 + 0x1e;
      iVar7 = iVar17 + -1;
    } while (iVar7 != 0);
    iVar17 = iVar17 + 0xf;
    do {
      FUN_00415020();
      iVar17 = iVar17 + -1;
      puVar11 = extraout_ECX_01;
    } while (iVar17 != 0);
  }
  else if (DAT_0079dba0 == 3) {
    uVar13 = (uint)*(byte *)(DAT_00791594 + 0x30) * 2;
    uVar8 = (uint)*(byte *)(DAT_00791594 + 0x31) * 2;
    uVar14 = (uint)*(uint3 *)(DAT_00791594 + 0x58);
    DAT_0079dbf8 = DAT_0079dbf4;
    uVar15 = (uVar8 + *(byte *)(DAT_00791594 + 0x59) & 0x1fffffe) << 7 |
             ((uint)*(byte *)(DAT_00791594 + 0x32) * 2 + (uint)*(byte *)(DAT_00791594 + 0x5a) &
             0x1fffe) << 0xf | uVar13 + *(byte *)(DAT_00791594 + 0x58) >> 1;
    _DAT_0079dbfc = (int)DAT_0079dbf4 + 0x1d00;
    uVar13 = ((uint)*(byte *)(DAT_00791594 + 0x32) << 9 | uVar8) << 8 | uVar13;
    uVar8 = 0;
    puVar11 = (uint *)((int)DAT_0079dbf4 + 0x20);
    do {
      if ((uVar8 & 1) == 0) {
        puVar11[-7] = uVar14;
        *puVar11 = uVar14;
        puVar11[7] = uVar15;
        puVar11[0xe] = uVar15;
      }
      else {
        puVar11[-7] = uVar15;
        *puVar11 = uVar15;
        puVar11[7] = uVar13;
        puVar11[0xe] = uVar13;
      }
      *(undefined1 *)((int)puVar11 + -0x19) = 0x38;
      uVar8 = uVar8 + 1;
      puVar11 = puVar11 + 0x1d;
    } while (uVar8 < 0x40);
  }
  _DAT_0079dc34 = (int)DAT_0079dc2c + 0x1800;
  DAT_0079dc30 = DAT_0079dc2c;
  FUN_00415220(puVar11);
  uVar4 = DAT_0079dc40;
  iVar17 = 0;
  DAT_0079dc3c = CONCAT13(DAT_0079dc3c._3_1_,0xffffff);
  iVar7 = 8;
  DAT_0079dc40._3_1_ = SUB41(uVar4,3);
  DAT_0079dc40._0_3_ =
       CONCAT12(*(char *)(DAT_00791594 + 0x32) * '\x02',
                CONCAT11(*(char *)(DAT_00791594 + 0x31) * '\x02',
                         *(char *)(DAT_00791594 + 0x30) * '\x02'));
  psVar12 = (short *)(DAT_0079dbe4 + 0x10);
  do {
    if (iVar17 < psVar12[-8]) {
      iVar17 = (int)psVar12[-8];
    }
    if (iVar17 < psVar12[-4]) {
      iVar17 = (int)psVar12[-4];
    }
    if (iVar17 < *psVar12) {
      iVar17 = (int)*psVar12;
    }
    if (iVar17 < psVar12[4]) {
      iVar17 = (int)psVar12[4];
    }
    iVar7 = iVar7 + -1;
    psVar12 = psVar12 + 0x10;
  } while (iVar7 != 0);
  iVar7 = (int)(0x400000 / (longlong)iVar17);
  uVar13 = 0;
  do {
    *(short *)(uVar13 + DAT_0079dbe4) =
         (short)((uint)(*(short *)(uVar13 + DAT_0079dbe4) * iVar7) >> 8);
    *(short *)(DAT_0079dbe4 + 4 + uVar13) =
         (short)((uint)(*(short *)(DAT_0079dbe4 + 4 + uVar13) * iVar7) >> 8);
    *(short *)(DAT_0079dbe4 + 2 + uVar13) =
         (short)((uint)(*(short *)(DAT_0079dbe4 + 2 + uVar13) * iVar7) >> 8);
    *(short *)(DAT_0079dbe4 + 6 + uVar13) =
         (short)((uint)(*(short *)(DAT_0079dbe4 + 6 + uVar13) * iVar7) >> 8);
    uVar13 = uVar13 + 8;
  } while (uVar13 < 0x100);
  FUN_00413ac0();
  DAT_0079dc38 = FUN_00413ac0();
LAB_004140d1:
  DAT_0079dc48 = DAT_0079dc3c;
  DAT_0079dc4c = DAT_0079dc40;
  if (*(char *)(DAT_00791594 + 6) == '\x0f') {
    _DAT_0079dba4 = 1;
    uRam0079dba8 = 1;
    uRam0079dbac = 1;
    DAT_0079dbb0 = 0;
  }
  return;
}

