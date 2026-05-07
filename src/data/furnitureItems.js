import chairImage from "../assets/chair-item.svg";
import coffeeTableImage from "../assets/coffee-table-item.svg";
import sofaImage from "../assets/sofa-room-3x1.svg";

const furnitureItems = {
  chair: {
    id: "chair",
    name: "Chair",
    width: 1,
    height: 1,
    color: "#22c55e",
    image: chairImage,
    render: {
      scaleX: 0.72,
      scaleY: 1.05,
      offsetX: 0,
      offsetY: -4,
      shadowScale: 0.7,
    },
  },
  table: {
    id: "table",
    name: "Coffee Table",
    width: 2,
    height: 2,
    color: "#c084fc",
    image: coffeeTableImage,
    render: {
      scaleX: 0.92,
      scaleY: 0.82,
      offsetX: 0,
      offsetY: 2,
      shadowScale: 0.86,
    },
  },
  sofa: {
    id: "sofa",
    name: "Sofa",
    width: 3,
    height: 1,
    color: "#f97316",
    image: sofaImage,
    render: {
      scaleX: 1.08,
      scaleY: 0.68,
      offsetX: 0,
      offsetY: 10,
      shadowScale: 0.96,
      liftScale: 0.45,
      liftOffset: -6,
    },
  },
};

export default furnitureItems;
