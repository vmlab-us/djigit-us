import { expect, it } from "vitest";
import { linkDealersAndFleet } from "../src/dealers.js";

it("links exact normalized dealer names and keeps aligned contacts", () => {
  const dealers = [
    ["ID дилера","Бренд","Дилерский центр","Расстояние (мили)","Адрес / сведения из карточки","Телефон","Веб-сайт"],
    ["d1","Toyota","Bob’s Toyota — North","12","LA","555","https://dealer.example"],
  ];
  const fleet = [
    ["Дилерский центр","Бренд(ы)","Fleet-контакты и должности","Прямые телефоны","Электронная почта","Телефон отдела / основной"],
    ["  bob's toyota - north ","Toyota","1. Ann Manager\n2. Ben Director","1. 111\n2. 222","1. a@example.com\n2. b@example.com","333"],
  ];
  const [dealer] = linkDealersAndFleet(dealers, fleet);
  expect(dealer.fleetLinkStatus).toBe("matched");
  expect(dealer.fleet.contacts[1]).toEqual({ nameAndTitle: "Ben Director", phone: "222", email: "b@example.com" });
});

it("refuses ambiguous fleet linking", () => {
  const dealers = [["Дилерский центр"],["Same Dealer"]];
  const fleet = [["Дилерский центр"],["Same Dealer"],["Same Dealer"]];
  expect(linkDealersAndFleet(dealers, fleet)[0].fleetLinkStatus).toBe("ambiguous");
});
