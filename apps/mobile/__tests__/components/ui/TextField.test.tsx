import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Pressable, Text } from "react-native";

import { TextField } from "@/components/ui/TextField";

describe("TextField", () => {
  it("keeps fast typed text visible while a focused parent render is stale", () => {
    const onChangeText = jest.fn();
    const { rerender } = render(
      <TextField
        label="Amount"
        value=""
        onChangeText={onChangeText}
        keyboardType="numeric"
      />
    );
    fireEvent(screen.getByLabelText("Amount"), "focus", {});
    fireEvent.changeText(screen.getByLabelText("Amount"), "2");
    fireEvent.changeText(screen.getByLabelText("Amount"), "22");
    rerender(
      <TextField
        label="Amount"
        value="2"
        onChangeText={onChangeText}
        keyboardType="numeric"
      />
    );

    expect(screen.getByLabelText("Amount")).toHaveDisplayValue("22");
    expect(onChangeText).toHaveBeenCalledWith("2");
    expect(onChangeText).toHaveBeenCalledWith("22");
  });

  it("syncs external value changes while not focused", () => {
    const { rerender } = render(<TextField label="Amount" value="10" />);

    rerender(<TextField label="Amount" value="25" />);

    expect(screen.getByLabelText("Amount")).toHaveDisplayValue("25");
  });

  it("aligns adornments and reserves the approved input space", () => {
    render(
      <TextField
        testID="password-field"
        label="Password"
        leadingAdornment={<Text>lock</Text>}
        trailingAdornment={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show password"
          >
            <Text>eye</Text>
          </Pressable>
        }
      />
    );

    expect(screen.getByText("lock")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Show password" })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Password")).toHaveStyle({
      paddingStart: 43,
      paddingEnd: 48,
    });
    expect(screen.getByTestId("password-field-leading-adornment")).toHaveStyle({
      position: "absolute",
      top: 0,
      bottom: 0,
      start: 0,
      width: 47,
      alignItems: "center",
      justifyContent: "center",
    });
    expect(screen.getByTestId("password-field-trailing-adornment")).toHaveStyle(
      {
        position: "absolute",
        top: 0,
        bottom: 0,
        end: 0,
        width: 50,
        alignItems: "center",
        justifyContent: "center",
      }
    );
  });

  it("associates inline errors with the input and announces them", () => {
    render(
      <TextField label="Email" error="Enter a valid email." value="invalid" />
    );

    expect(
      screen.getByRole("alert", { name: "Enter a valid email." })
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toHaveProp("aria-invalid", true);
  });

  it("accepts localized font styles for labels and errors", () => {
    render(
      <TextField
        label="Email"
        error="Invalid email"
        labelStyle={{ fontFamily: "NotoSansArabic_600SemiBold" }}
        errorStyle={{ fontFamily: "NotoSansArabic_400Regular" }}
      />
    );

    expect(screen.getByText("Email")).toHaveStyle({
      fontFamily: "NotoSansArabic_600SemiBold",
    });
    expect(screen.getByRole("alert")).toHaveStyle({
      fontFamily: "NotoSansArabic_400Regular",
    });
  });
});
