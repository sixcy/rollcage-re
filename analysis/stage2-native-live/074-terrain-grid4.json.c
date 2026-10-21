
void FUN_004142f0(void)

{
  undefined2 *puVar1;
  ushort uVar2;
  uint uVar3;
  undefined4 *puVar4;
  int in_ECX;
  undefined2 *puVar5;
  uint uVar6;
  ushort *puVar7;
  undefined4 *puVar8;
  undefined2 *puVar9;
  
  uVar3 = 0xffff;
  if ((DAT_0079dba0 == 1) || (DAT_0079dba0 == 3)) {
    puVar5 = (undefined2 *)(*(int *)(in_ECX + 0x1c) + in_ECX);
    if (DAT_0079dc1c != 0) {
      puVar7 = puVar5 + 0x10;
      uVar6 = DAT_0079dc1c;
      do {
        uVar2 = *puVar7;
        puVar7 = puVar7 + 0x11;
        if (uVar2 < uVar3) {
          uVar3 = (uint)uVar2;
        }
        uVar6 = uVar6 - 1;
      } while (uVar6 != 0);
    }
    uVar6 = 0;
    if (DAT_0079dc1c != 0) {
      puVar4 = (undefined4 *)(uVar3 * 0x10 + DAT_00791590);
      puVar8 = (undefined4 *)(DAT_0079dc00 + 0x20);
      puVar9 = DAT_0079dc18;
      do {
        *puVar9 = *puVar5;
        uVar6 = uVar6 + 1;
        puVar9[1] = puVar5[1];
        puVar9[2] = puVar5[2];
        puVar9[4] = puVar5[4];
        puVar9[5] = puVar5[5];
        puVar9[6] = puVar5[6];
        puVar9[8] = puVar5[8];
        puVar9[9] = puVar5[9];
        puVar9[10] = puVar5[10];
        puVar9[0xc] = puVar5[0xc];
        puVar9[0xd] = puVar5[0xd];
        puVar1 = puVar5 + 0xe;
        puVar5 = puVar5 + 0x11;
        puVar9[0xe] = *puVar1;
        puVar8[-7] = 0xffffffff;
        *puVar8 = *puVar4;
        puVar8[7] = puVar4[1];
        *(undefined2 *)(puVar8 + 0xe) = *(undefined2 *)(puVar4 + 2);
        *(undefined2 *)(puVar8 + 0x15) = *(undefined2 *)((int)puVar4 + 10);
        *(undefined1 *)((int)puVar8 + -0x19) = 0x98;
        puVar8 = puVar8 + 0x1e;
        puVar9 = puVar9 + 0x10;
      } while (uVar6 < DAT_0079dc1c);
    }
    if (PTR_DAT_00513214[0xf] == '\0') {
      DAT_0079dc24 = 0;
      return;
    }
    if (PTR_DAT_00513214[0xf] == '\x01') {
      DAT_0079dc24 = DAT_0079dc24 >> 1;
    }
    uVar3 = 0;
    if (DAT_0079dc24 != 0) {
      puVar5 = puVar5 + 2;
      puVar9 = DAT_0079dc20;
      puVar8 = (undefined4 *)(DAT_0079dc0c + 0x20);
      do {
        *puVar9 = puVar5[-2];
        puVar9[1] = puVar5[-1];
        uVar3 = uVar3 + 1;
        puVar9[2] = *puVar5;
        puVar9[4] = puVar5[2];
        puVar9[5] = puVar5[3];
        puVar9[6] = puVar5[4];
        puVar9[8] = puVar5[6];
        puVar9[9] = puVar5[7];
        puVar9[10] = puVar5[8];
        puVar9[0xc] = puVar5[10];
        puVar9[0xd] = puVar5[0xb];
        puVar9[0xe] = puVar5[0xc];
        puVar4 = (undefined4 *)((uint)(ushort)puVar5[0xe] * 0x10 + DAT_00791590);
        puVar8[-7] = 0x60606060;
        *puVar8 = *puVar4;
        puVar8[7] = puVar4[1];
        *(undefined2 *)(puVar8 + 0xe) = *(undefined2 *)(puVar4 + 2);
        *(undefined2 *)(puVar8 + 0x15) = *(undefined2 *)((int)puVar4 + 10);
        *(undefined1 *)((int)puVar8 + -0x19) = 0x9a;
        puVar5 = puVar5 + 0x11;
        puVar9 = puVar9 + 0x10;
        puVar8 = puVar8 + 0x1e;
      } while (uVar3 < DAT_0079dc24);
    }
  }
  return;
}

