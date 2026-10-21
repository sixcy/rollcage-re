
void FUN_00433a10(void)

{
  undefined2 uVar1;
  int in_ECX;
  undefined4 in_EDX;
  
  switch(in_EDX) {
  case 1:
    uVar1 = *(undefined2 *)(in_ECX + 0x20);
    *(undefined2 *)(in_ECX + 0x20) = *(undefined2 *)(in_ECX + 0x40);
    *(undefined2 *)(in_ECX + 0x40) = *(undefined2 *)(in_ECX + 0x80);
    *(undefined2 *)(in_ECX + 0x80) = *(undefined2 *)(in_ECX + 0x60);
    *(undefined2 *)(in_ECX + 0x60) = uVar1;
    return;
  case 2:
    uVar1 = *(undefined2 *)(in_ECX + 0x20);
    *(undefined2 *)(in_ECX + 0x20) = *(undefined2 *)(in_ECX + 0x80);
    *(undefined2 *)(in_ECX + 0x80) = uVar1;
    uVar1 = *(undefined2 *)(in_ECX + 0x40);
    *(undefined2 *)(in_ECX + 0x40) = *(undefined2 *)(in_ECX + 0x60);
    *(undefined2 *)(in_ECX + 0x60) = uVar1;
    return;
  case 3:
    uVar1 = *(undefined2 *)(in_ECX + 0x20);
    *(undefined2 *)(in_ECX + 0x20) = *(undefined2 *)(in_ECX + 0x60);
    *(undefined2 *)(in_ECX + 0x60) = *(undefined2 *)(in_ECX + 0x80);
    *(undefined2 *)(in_ECX + 0x80) = *(undefined2 *)(in_ECX + 0x40);
    *(undefined2 *)(in_ECX + 0x40) = uVar1;
    return;
  case 4:
    uVar1 = *(undefined2 *)(in_ECX + 0x20);
    *(undefined2 *)(in_ECX + 0x20) = *(undefined2 *)(in_ECX + 0x60);
    *(undefined2 *)(in_ECX + 0x60) = uVar1;
    uVar1 = *(undefined2 *)(in_ECX + 0x40);
    *(undefined2 *)(in_ECX + 0x40) = *(undefined2 *)(in_ECX + 0x80);
    *(undefined2 *)(in_ECX + 0x80) = uVar1;
    return;
  case 5:
    uVar1 = *(undefined2 *)(in_ECX + 0x20);
    *(undefined2 *)(in_ECX + 0x20) = *(undefined2 *)(in_ECX + 0x80);
    *(undefined2 *)(in_ECX + 0x80) = uVar1;
    return;
  case 6:
    uVar1 = *(undefined2 *)(in_ECX + 0x20);
    *(undefined2 *)(in_ECX + 0x20) = *(undefined2 *)(in_ECX + 0x40);
    *(undefined2 *)(in_ECX + 0x40) = uVar1;
    uVar1 = *(undefined2 *)(in_ECX + 0x60);
    *(undefined2 *)(in_ECX + 0x60) = *(undefined2 *)(in_ECX + 0x80);
    *(undefined2 *)(in_ECX + 0x80) = uVar1;
    return;
  case 7:
    uVar1 = *(undefined2 *)(in_ECX + 0x40);
    *(undefined2 *)(in_ECX + 0x40) = *(undefined2 *)(in_ECX + 0x60);
    *(undefined2 *)(in_ECX + 0x60) = uVar1;
  }
  return;
}

