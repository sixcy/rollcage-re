
void FUN_004173f0(void)

{
  undefined *puVar1;
  ushort uVar2;
  undefined2 uVar3;
  int *piVar4;
  int in_ECX;
  uint *puVar5;
  uint uVar6;
  int iVar7;
  int iVar8;
  uint uVar9;
  int iVar10;
  
  switch(PTR_DAT_00513210[0x281]) {
  case 1:
  case 2:
    iVar8 = 2;
    break;
  case 3:
    iVar8 = 3;
    break;
  case 4:
    iVar8 = 4;
    break;
  default:
    iVar8 = 1;
  }
  iVar7 = in_ECX * 0x140;
  if (((&DAT_0079d39c)[in_ECX * 0x50] == 3) &&
     ((*(uint *)((&DAT_006ba580)[*(short *)(&DAT_0079d398 + iVar7)] + 0x168) & 0xffff0000) == 0)) {
    (&DAT_0079d39c)[in_ECX * 0x50] = 0;
  }
  if (((&DAT_0079d39c)[in_ECX * 0x50] == 2) &&
     (*(int *)((&DAT_006ba570)[*(short *)(&DAT_0079d398 + iVar7)] + 0x184) == 0)) {
    (&DAT_0079d39c)[in_ECX * 0x50] = 0;
  }
  uVar9 = 0;
  iVar10 = 0;
  if (iVar8 != 0) {
    puVar5 = &DAT_0079d468;
    do {
      if (uVar9 <= *puVar5) {
        uVar9 = *puVar5;
      }
      if (puVar5[-0x33] != 0) {
        return;
      }
      iVar10 = iVar10 + 1;
      puVar5 = puVar5 + 0x50;
    } while (iVar10 < iVar8);
  }
  if ((PTR_DAT_00513210[0x2c0] != '\x02') && ((short)(&DAT_0079d39a)[in_ECX * 0xa0] < 1)) {
    if (PTR_DAT_00513210[0x2c1] == '\x01') {
      uVar2 = (short)(&DAT_0079d392)[in_ECX * 0xa0] >> 1;
    }
    else {
      uVar2 = (&DAT_0079d392)[in_ECX * 0xa0];
    }
    if (0x3b < uVar2) {
      uVar6 = DAT_0076a324;
      if (PTR_DAT_00513210[0x2c1] == '\x01') {
        uVar6 = DAT_0076a324 >> 1;
      }
      if (((uVar9 + 0x708 <= uVar6) && ((&DAT_0079d360)[in_ECX * 0xa0] != 10)) &&
         ((&DAT_0079d360)[in_ECX * 0xa0] != 9)) {
        iVar8 = 0;
        do {
          if (((*(uint *)((&DAT_006ba580)[iVar8] + 0x168) & 0x10000) != 0) &&
             (*(short *)((&DAT_006ba580)[iVar8] + 0x168) == 1)) {
            *(short *)(&DAT_0079d398 + iVar7) = (short)iVar8;
            (&DAT_0079d39c)[in_ECX * 0x50] = 3;
            (&DAT_0079d360)[in_ECX * 0xa0] = 6;
            break;
          }
          iVar8 = iVar8 + 1;
        } while (iVar8 < 0x26);
        puVar1 = PTR_DAT_00513210;
        if ((&DAT_0079d39c)[in_ECX * 0x50] == 0) {
          iVar8 = 0;
          while ((*(byte *)((&DAT_006ba570)[iVar8] + 0x184) & 1) == 0) {
            iVar8 = iVar8 + 1;
            if (3 < iVar8) {
              return;
            }
          }
          (&DAT_0079d39c)[in_ECX * 0x50] = 2;
          iVar10 = 0;
          *(short *)(&DAT_0079d398 + iVar7) = (short)iVar8;
          (&DAT_0079d360)[in_ECX * 0xa0] = 3;
          uVar9 = DAT_0076a324;
          if ((byte)puVar1[0x27c] != 0) {
            piVar4 = &DAT_00768e20;
            do {
              if (*piVar4 == *(int *)((&DAT_006ba570)[iVar8] + 0x164)) goto LAB_00417600;
              iVar10 = iVar10 + 1;
              piVar4 = piVar4 + 0x10d;
            } while (iVar10 < (int)(uint)(byte)puVar1[0x27c]);
          }
          iVar10 = 0;
LAB_00417600:
          (&DAT_0079d392)[in_ECX * 0xa0] = 0;
          *(short *)((int)&DAT_0079d394 + iVar7 + 2) = (short)iVar10;
          if (puVar1[0x2c1] == '\x01') {
            uVar9 = uVar9 >> 1;
          }
          uVar3 = 0x96;
          (&DAT_0079d468)[in_ECX * 0x50] = uVar9;
          if (puVar1[0x2c1] == '\x01') {
            uVar3 = 300;
          }
          *(undefined2 *)(&DAT_0079d394 + in_ECX * 0x50) = uVar3;
        }
      }
    }
  }
  return;
}

